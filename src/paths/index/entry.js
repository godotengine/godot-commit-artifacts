import { LitElement, html, css, customElement, property } from 'lit-element';

import PageContent from 'src/shared/components/PageContent';
import SharedNavigation from 'src/shared/components/SharedNavigation';
import IndexHeader from "./components/IndexHeader";
import IndexDescription from "./components/IndexDescription";

import BranchList from "./components/branches/BranchList";
import CommitList from "./components/commits/CommitList";

@customElement('entry-component')
export default class EntryComponent extends LitElement {
    static get styles() {
        return css`
          /** Colors and variables **/
          :host {
          }
          @media (prefers-color-scheme: dark) {
            :host {
            }
          }

          /** Component styling **/
          :host {
          }

          :host .branches {
            display: flex;
            padding: 24px 0;
          }

          @media only screen and (max-width: 900px) {
            :host .branches {
              flex-wrap: wrap;
            }
          }
        `;
    }

    constructor() {
        super();

        this._entryRequested = false;
        this._isLoading = true;
        this._loadingBranches = [];

        this._branches = [ "master", "4.0", "3.x", "3.5" ];
        this._branchData = {};

        this._selectedRepository = "godotengine/godot";
        this._selectedBranch = "";

        this._restoreUserPreferences();
        this._requestData();
    }

    performUpdate() {
        this._requestData();
        super.performUpdate();
    }

    _restoreUserPreferences() {
        const userPreferences = greports.util.getLocalPreferences();

        // ...
    }

    _saveUserPreferences() {
        const currentPreferences = {
            // ...
        };

        greports.util.setLocalPreferences(currentPreferences);
    }

    async _requestData() {
        if (this._entryRequested) {
            return;
        }
        this._entryRequested = true;
        this._isLoading = true;

        this._isLoading = false;
        this.requestUpdate();

        this._branches.forEach((branch) => {
            this._requestBranchData(branch);
        });
    }

    async _requestBranchData(branch) {
        // Start loading, show the indicator.
        this._loadingBranches.push(branch);

        const branchData = await greports.api.getBranchData(this._selectedRepository, branch);

        if (branchData) {
            this._branchData[branch] = branchData;
        }

        // Finish loading, hide the indicator.
        const index = this._loadingBranches.indexOf(branch);
        this._loadingBranches.splice(index, 1);
        this.requestUpdate();
    }

    _onBranchClicked(event) {
        this._selectedBranch = event.detail.branch;
        this.requestUpdate();

        window.scrollTo(0, 0);
    }

    render() {
        // Dereferencing to ensure it triggers an update.
        const [...branches] = this._branches;
        const [...loadingBranches] = this._loadingBranches;

        let commits = [];
        let checks = {};
        let runs = {};
        let artifacts = {};
        let latest = {};

        if (this._selectedBranch !== "" && typeof this._branchData[this._selectedBranch] !== "undefined") {
            const branchData = this._branchData[this._selectedBranch];

            commits = branchData.commits;
            checks = branchData.checks;
            runs = branchData.runs;
            artifacts = branchData.artifacts;
            latest = branchData.latest;
        }

        return html`
            <page-content>
                <shared-nav></shared-nav>
                <gr-index-entry></gr-index-entry>
                <gr-index-description></gr-index-description>

                ${(this._isLoading ? html`
                    <h3>Loading...</h3>
                ` : html`
                    <div class="branches">
                        <gr-branch-list
                            .branches="${branches}"
                            .loadingBranches="${loadingBranches}"
                            .selectedBranch="${this._selectedBranch}"
                            @branchclick="${this._onBranchClicked}"
                        ></gr-branch-list>

                        ${(this._selectedBranch !== "" ? html`
                            <gr-commit-list
                                .commits="${commits}"
                                .checks="${checks}"
                                .runs="${runs}"
                                .artifacts="${artifacts}"
                                .latest="${latest}"

                                .selectedRepository="${this._selectedRepository}"
                                .selectedBranch="${this._selectedBranch}"
                                ?loading="${loadingBranches.indexOf(this._selectedBranch) >= 0}"
                            ></gr-commit-list>
                        ` : null)}
                    </div>
                `)}
            </page-content>
        `;
    }
}
