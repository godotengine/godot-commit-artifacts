const fs = require('fs').promises;
const fsConstants = require('fs').constants;
const fetch = require('node-fetch');

const ExitCodes = {
    "RequestFailure": 1,
    "ParseFailure": 2,
    "ExecFailure": 3,
    "IOFailure": 4,
};

const LogFormat = {
    "Raw": 0,
    "JSON": 1,
};

const API_DELAY_MSEC = 1500;
const API_MAX_RETRIES = 5;
const API_RATE_LIMIT = `
  rateLimit {
    limit
    cost
    nodeCount
    remaining
    resetAt
  }
`;

class DataFetcher {
    constructor(data_owner, data_repo) {
        this.data_owner = data_owner;
        this.data_repo = data_repo;

        this.repo_ssh_path = `git@github.com:${data_owner}/${data_repo}.git`;
        this.api_rest_path = `https://api.github.com/repos/${data_owner}/${data_repo}`;
        this.api_repository_id = `owner:"${data_owner}" name:"${data_repo}"`;
    }

    async _logResponse(data, name, format = LogFormat.JSON) {
        try {
            await ensureDir("./logs");

            let filename = `./logs/${name}`;
            let fileContent = "" + data;

            if (format === LogFormat.JSON) {
                filename = `./logs/${name}.json`;
                fileContent = JSON.stringify(data, null, 4);
            }

            await fs.writeFile(filename, fileContent, {encoding: "utf-8"});
        } catch (err) {
            console.error("    Error saving log file: " + err);
        }
    }

    _handleResponseErrors(queryID, res) {
        console.warn(`    Failed to get data from '${queryID}'; server responded with ${res.status} ${res.statusText}`);
        const retry_header = res.headers.get("Retry-After");
        if (retry_header) {
            console.log(`    Retry after: ${retry_header}`);
        }
    }

    _handleDataErrors(data) {
        if (typeof data["errors"] === "undefined") {
            return;
        }

        console.warn(`    Server handled the request, but there were errors:`);
        data.errors.forEach((item) => {
           console.log(`    [${item.type}] ${item.message}`);
        });
    }

    async delay(msec) {
        return new Promise(resolve => setTimeout(resolve, msec));
    }

    async fetchGithub(query, retries = 0) {
        const init = {};
        init.method = "POST";
        init.headers = {};
        init.headers["Content-Type"] = "application/json";
        if (process.env.GRAPHQL_TOKEN) {
            init.headers["Authorization"] = `token ${process.env.GRAPHQL_TOKEN}`;
        } else if (process.env.GITHUB_TOKEN) {
            init.headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
        }

        init.body = JSON.stringify({
            query,
        });

        let res = await fetch("https://api.github.com/graphql", init);
        let attempt = 0;
        while (res.status !== 200 && attempt < retries) {
            attempt += 1;
            console.log(`    Failed with status ${res.status}, retrying (${attempt}/${retries})...`);

            // GitHub API is flaky, so we add an extra delay to let it calm down a bit.
            await this.delay(API_DELAY_MSEC);
            res = await fetch("https://api.github.com/graphql", init);
        }

        return res;
    }

    async fetchGithubRest(query) {
        const init = {};
        init.method = "GET";
        init.headers = {};
        init.headers["Content-Type"] = "application/json";
        if (process.env.GRAPHQL_TOKEN) {
            init.headers["Authorization"] = `token ${process.env.GRAPHQL_TOKEN}`;
        } else if (process.env.GITHUB_TOKEN) {
            init.headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
        }

        return await fetch(`${this.api_rest_path}${query}`, init);
    }

    async checkRates() {
        try {
            const query = `
            query {
              ${API_RATE_LIMIT}
            }
            `;

            const res = await this.fetchGithub(query);
            if (res.status !== 200) {
                this._handleResponseErrors(this.api_repository_id, res);
                process.exitCode = ExitCodes.RequestFailure;
                return;
            }

            const data = await res.json();
            await this._logResponse(data, "_rate_limit");
            this._handleDataErrors(data);

            const rate_limit = data.data["rateLimit"];
            console.log(`    [$${rate_limit.cost}][${rate_limit.nodeCount}] Available API calls: ${rate_limit.remaining}/${rate_limit.limit}; resets at ${rate_limit.resetAt}`);
        } catch (err) {
            console.error("    Error checking the API rate limits: " + err);
            process.exitCode = ExitCodes.RequestFailure;
            return;
        }
    }

    async fetchRuns(branchName) {
        try {
            const query = `
            query {
                ${API_RATE_LIMIT}

                repository (${this.api_repository_id}) {
                    object (expression: "${branchName}") {
                        ... on Commit {
                            history(first: 10) {
                                edges {
                                    node {
                                        ...CommitData
                                    }
                                }
                            }
                        }
                    }
                }
            }

            fragment CommitData on Commit {
                oid
                committedDate
                messageHeadline

                checkSuites(first: 20) {
                    edges {
                        node {
                            ...CheckSuiteData
                        }
                    }
                }
            }

            fragment CheckSuiteData on CheckSuite {
                databaseId
                url
                status
                conclusion
                createdAt
                updatedAt
                workflowRun {
                    databaseId
                    workflow {
                        databaseId
                        name
                    }
                }
            }
            `;

            console.log(`    Requesting workflow runs data for commits in "${branchName}".`);

            const res = await this.fetchGithub(query, API_MAX_RETRIES);
            if (res.status !== 200) {
                this._handleResponseErrors(this.api_repository_id, res);
                process.exitCode = ExitCodes.RequestFailure;
                return [];
            }

            const data = await res.json();
            await this._logResponse(data, `data_runs_${branchName}`);
            this._handleDataErrors(data);

            const repository = data.data["repository"];
            const run_data = mapNodes(repository.object["history"]);

            const rate_limit = data.data["rateLimit"];
            console.log(`    [$${rate_limit.cost}][${rate_limit.nodeCount}] Retrieved ${run_data.length} commits and their runs.`);
            console.log(`    --`);
            return run_data;
        } catch (err) {
            console.error("    Error fetching workflow runs data: " + err);
            process.exitCode = ExitCodes.RequestFailure;
            return [];
        }
    }

    async fetchArtifacts(runId) {
        try {
            const query = `/actions/runs/${runId}/artifacts`;

            const res = await this.fetchGithubRest(query);
            if (res.status !== 200) {
                this._handleResponseErrors(query, res);
                process.exitCode = ExitCodes.RequestFailure;
                return [];
            }

            const data = await res.json();
            await this._logResponse(data, `data_artifacts_${runId}`);
            this._handleDataErrors(data);

            const artifacts_data = data.artifacts;

            console.log(`    [$0] Retrieved ${artifacts_data.length} artifacts for '${runId}'; processing...`);

            return artifacts_data;
        } catch (err) {
            console.error("    Error fetching artifact data: " + err);
            process.exitCode = ExitCodes.RequestFailure;
            return [];
        }
    }
}

class DataProcessor {
    constructor() {
        this.commits = [];
        this.checks = {};
        this.runs = {};
    }

    readExistingData(existingData) {
        if (typeof existingData.commits !== "undefined") {
            this.commits = existingData.commits;
        }
        if (typeof existingData.checks !== "undefined") {
            this.checks = existingData.checks;
        }
        if (typeof existingData.runs !== "undefined") {
            this.runs = existingData.runs;
        }
    }

    reduceData() {
        // The goal is to display only the most recent commits and their artifacts.
        // However, we can't just always fetch the last N commits and be done with
        // it. Fetched commits can still be in progress, and we want to have at least
        // some version available.

        // Note that artifacts expire, so it is still possible to have none. But we
        // should at least try.

        const MAX_COMMITS = 20;

        // Determine which commits are the latest available with ready builds.
        const latestArtifacts = this.getLatestArtifacts();
        const latestCommits = [];
        for (let artifactName in latestArtifacts) {
            const artifactCommit = latestArtifacts[artifactName].commit_hash;
            if (latestCommits.indexOf(artifactCommit) < 0) {
                latestCommits.push(artifactCommit);
            }
        }

        for (let i = 0; i < this.commits.length; i++) {
            const commit = this.commits[i];
            const commitIndex = latestCommits.indexOf(commit.hash);
            if (commitIndex >= 0) {
                latestCommits.splice(commitIndex, 1);
            }

            // We want to have at least MAX_COMMITS commits; and we also want to
            // hit every commit contributing to the latest artifacts.
            if (i < MAX_COMMITS || latestCommits.length > 0) {
                continue;
            }

            // But beyond that, cut it all out.
            console.log(`    Removed extra commit ${commit.hash}.`);

            this.commits.splice(i, 1);
            for (let checkId of commit.checks) {
                const check = this.checks[checkId];
                delete this.checks[checkId];

                if (check.workflow !== "") {
                    delete this.runs[check.workflow];
                }
            }
        }
    }

    processRuns(runsRaw) {
        try {
            // We will be adding items to the front, so reversing is
            // necessary.
            runsRaw.reverse();

            runsRaw.forEach((item) => {
                // Check if this commit is already tracked.
                let commit = this.commits.find((it) => {
                    return it.hash === item.oid;
                });

                if (!commit) {
                    // Compile basic information about a commit.
                    commit = {
                        "hash": item.oid,
                        "title": item.messageHeadline,
                        "committed_date": item.committedDate,
                        "checks": [],
                    };
                    this.commits.unshift(commit);
                }

                const checkSuites = mapNodes(item.checkSuites);
                checkSuites.forEach((checkItem) => {
                    let check = this.checks[checkItem.databaseId];

                    if (typeof check === "undefined") {
                        // Compile basic information about a check suite.
                        check = {
                            "check_id": checkItem.databaseId,
                            "check_url": checkItem.url,
                            "status": checkItem.status,
                            "conclusion": checkItem.conclusion,

                            "created_at": checkItem.createdAt,
                            "updated_at": checkItem.updatedAt,

                            "workflow": "",
                        };
                        this.checks[check.check_id] = check;
                    } else {
                        check.status = checkItem.status;
                        check.conclusion = checkItem.conclusion;
                        check.updated_at = checkItem.updatedAt;
                    }

                    if (check.workflow === "" && checkItem.workflowRun) {
                        const runItem = checkItem.workflowRun;
                        let run = {
                            "name": runItem.workflow.name,
                            "workflow_id": runItem.workflow.databaseId,
                            "run_id": runItem.databaseId,

                            "artifacts": [],
                        };

                        this.runs[run.run_id] = run;
                        check.workflow = run.run_id;
                    }


                    // Existing data may contain this commit, but not all of
                    // its checks.
                    if (commit.checks.indexOf(check.check_id) < 0) {
                        commit.checks.push(check.check_id);
                    }
                });
            });
        } catch (err) {
            console.error("    Error parsing pull request data: " + err);
            process.exitCode = ExitCodes.ParseFailure;
        }
    }

    getIncompleteRuns() {
        let runs = [];

        for (let runId in this.runs) {
            const runData = this.runs[runId];
            if (runData.artifacts.length > 0) {
                continue;
            }

            runs.push(runId);
        }

        return runs;
    }

    processArtifacts(runId, artifactsRaw) {
        try {
            artifactsRaw.forEach((item) => {
                let artifact = {
                    "id": item.id,
                    "name": item.name,
                    "size": item.size_in_bytes,

                    "created_at": item.created_at,
                    "updated_at": item.upadted_at,
                    "expires_at": item.expires_at,
                };

                this.runs[runId].artifacts.push(artifact);
            });
        } catch (err) {
            console.error("    Error parsing artifact data: " + err);
            process.exitCode = ExitCodes.ParseFailure;
        }
    }

    getLatestArtifacts() {
        let latest = {};

        this.commits.forEach((commit) => {
            for (let checkId of commit.checks) {
                const check = this.checks[checkId];
                if (check.workflow === "") {
                    continue;
                }

                const run = this.runs[check.workflow];
                run.artifacts.forEach((artifact) => {
                    if (typeof latest[artifact.name] !== "undefined") {
                        return; // Continue;
                    }

                    latest[artifact.name] = {
                        "commit_hash": commit.hash,
                        "check_id": check.check_id,
                        "workflow_name": run.name,
                        "artifact_id": artifact.id,
                        "artifact_name": artifact.name,
                        "artifact_size": artifact.size,
                    };
                });
            }
        });

        return latest;
    }
}

class DataIO {
    constructor() {
        // Configurable parameters.
        this.data_owner = "godotengine";
        this.data_repo = "godot";
        this.data_branch = "";
    }

    parseArgs() {
        process.argv.forEach((arg) => {
            if (arg.indexOf("owner:") === 0) {
                this.data_owner = arg.substring(6);
            }
            if (arg.indexOf("repo:") === 0) {
                this.data_repo = arg.substring(5);
            }
            if (arg.indexOf("branch:") === 0) {
                this.data_branch = arg.substring(7);
            }
        });

        if (this.data_owner === "" || this.data_repo === "" || this.data_branch === "") {
            console.error("    Error reading command-line arguments: owner, repo, and branch cannot be empty.");
            process.exitCode = ExitCodes.IOFailure;
            return;
        }
    }

    async loadData() {
        try {
            console.log("[*] Loading existing database from a file.");

            const dataPath = `./out/data/${this.data_owner}.${this.data_repo}.${this.data_branch}.json`;
            await fs.access(dataPath, fsConstants.R_OK);
            const fileRaw = await fs.readFile(dataPath, {encoding: "utf-8"});

            return JSON.parse(fileRaw);
        } catch (err) {
            return {};
        }
    }

    async saveData(output, fileName) {
        try {
            console.log("[*] Storing database to a file.");

            await ensureDir("./out");
            await ensureDir("./out/data");
            await fs.writeFile(`./out/data/${fileName}`, JSON.stringify(output), {encoding: "utf-8"});
        } catch (err) {
            console.error("    Error saving database file: " + err);
            process.exitCode = ExitCodes.IOFailure;
            return;
        }
    }

    async createRedirects(artifacts) {
        let redirectTemplate = "";

        try {
            const dataPath = `./build/res/redirect_index.html`;
            await fs.access(dataPath, fsConstants.R_OK);
            redirectTemplate = await fs.readFile(dataPath, {encoding: "utf-8"});

            if (redirectTemplate === "") {
                throw new Error("File is missing.");
            }
        } catch (err) {
            console.error("    Error loading a redirect template: " + err);
            process.exitCode = ExitCodes.IOFailure;
            return;
        }

        await ensureDir("./out");
        await ensureDir("./out/download");
        await ensureDir(`./out/download/${this.data_owner}`);
        await ensureDir(`./out/download/${this.data_owner}/${this.data_repo}`);
        await ensureDir(`./out/download/${this.data_owner}/${this.data_repo}/${this.data_branch}`);

        const outputDir = `./out/download/${this.data_owner}/${this.data_repo}/${this.data_branch}`;
        for (let artifactName in artifacts) {
            await ensureDir(`${outputDir}/${artifactName}`);

            try {
                const artifact = artifacts[artifactName];
                const artifactPath = `https://github.com/godotengine/godot/suites/${artifact.check_id}/artifacts/${artifact.artifact_id}`;

                const redirectPage = redirectTemplate.replace(/\{\{REDIRECT_PATH\}\}/g, artifactPath);
                await fs.writeFile(`${outputDir}/${artifactName}/index.html`, redirectPage, {encoding: "utf-8"});
                console.log(`    Created a redirect at ${outputDir}/${artifactName}.`)
            } catch (err) {
                console.error(`    Error saving a redirect page for "${artifactName}": ` + err);
                process.exitCode = ExitCodes.IOFailure;
                return;
            }
        }
    }
}

function mapNodes(object) {
    return object.edges.map((item) => item["node"])
}

async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath, fsConstants.R_OK | fsConstants.W_OK);
    } catch (err) {
        await fs.mkdir(dirPath);
    }
}

async function clearDir(rootPath) {
    try {
        const pathStat = await fs.stat(rootPath);
        if (!pathStat.isDirectory()) {
            return;
        }

        const removeDir = async (dirPath) => {
            const dirFiles = await fs.readdir(dirPath);
            for (let entryName of dirFiles) {
                if (entryName === "." || entryName === "..") {
                    continue;
                }

                const entryPath = `${dirPath}/${entryName}`;
                const entryStat = await fs.stat(entryPath);
                if (entryStat.isDirectory()) {
                    await removeDir(entryPath);
                    await fs.rmdir(entryPath);
                }
                else if (entryStat.isFile()) {
                    await fs.unlink(entryPath);
                }
            }
        };

        await removeDir(rootPath);
    } catch (err) {
        console.error(`    Error clearing a folder at ${rootPath}: ` + err);
        process.exitCode = ExitCodes.IOFailure;
        return;
    }
}

async function main() {
    // Internal utility methods.
    const checkForExit = () => {
        if (process.exitCode > 0) {
            console.log(`   Terminating with an exit code ${process.exitCode}.`);
            process.exit();
        }
    };

    console.log("[*] Building local workflow run database.");

    const dataIO = new DataIO();
    dataIO.parseArgs();
    checkForExit();

    console.log(`[*] Configured for the "${dataIO.data_owner}/${dataIO.data_repo}" repository; branch ${dataIO.data_branch}.`);

    const dataFetcher = new DataFetcher(dataIO.data_owner, dataIO.data_repo);
    const dataProcessor = new DataProcessor();

    const existingData = await dataIO.loadData();
    dataProcessor.readExistingData(existingData);

    console.log("[*] Checking the rate limits before.");
    await dataFetcher.checkRates();
    checkForExit();

    console.log("[*] Fetching workflow runs data from GitHub.");
    const runsRaw = await dataFetcher.fetchRuns(dataIO.data_branch);
    checkForExit();
    dataProcessor.processRuns(runsRaw);
    checkForExit();

    console.log("[*] Fetching artifact data from GitHub.");
    for (let runId of dataProcessor.getIncompleteRuns()) {
        const artifactsRaw = await dataFetcher.fetchArtifacts(runId);
        checkForExit();
        dataProcessor.processArtifacts(runId, artifactsRaw);
        checkForExit();

        // Wait for a bit before proceeding to avoid hitting the secondary rate limit in GitHub API.
        // See https://docs.github.com/en/rest/guides/best-practices-for-integrators#dealing-with-secondary-rate-limits.
        await dataFetcher.delay(API_DELAY_MSEC);
    }

    console.log("[*] Checking the rate limits after.");
    await dataFetcher.checkRates();
    checkForExit();

    console.log("[*] Reducing database.");
    dataProcessor.reduceData();
    const latestArtifacts = dataProcessor.getLatestArtifacts();

    console.log("[*] Finalizing database.")
    const output = {
        "generated_at": Date.now(),
        "commits": dataProcessor.commits,
        "checks": dataProcessor.checks,
        "runs": dataProcessor.runs,
        "latest": latestArtifacts,
    };

    await dataIO.saveData(output, `${dataIO.data_owner}.${dataIO.data_repo}.${dataIO.data_branch}.json`);
    checkForExit();

    console.log("[*] Creating stable download paths.");
    await dataIO.createRedirects(latestArtifacts);
    checkForExit();

    console.log("[*] Database built.");
}

main();
