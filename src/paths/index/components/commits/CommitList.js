import { LitElement, html, css, customElement, property } from 'lit-element';

import CommitItem from "./CommitItem";

@customElement('gr-commit-list')
export default class CommitList extends LitElement {
    static get styles() {
        return css`
          /** Colors and variables **/
          :host {
            --item-border-color: #fcfcfa;
            --commits-background-color: #e5edf8;
          }
          @media (prefers-color-scheme: dark) {
            :host {
              --item-border-color: #0d1117;
              --commits-background-color: #191d23;
            }
          }

          /** Component styling **/
          :host {
            flex-grow: 1;
          }

          :host .branch-commits {
            display: flex;
            flex-direction: column;
            gap: 24px;
            background-color: var(--commits-background-color);
            border-radius: 0 4px 4px 0;
            padding: 8px 12px;
            max-width: 760px;
          }
          @media only screen and (max-width: 900px) {
            :host .branch-commits {
              padding: 8px;
              max-width: 95%;
              margin: 0px auto;
            }
          }

          :host .branch-commits-empty {
            color: var(--g-font-color);
            display: inline-block;
            font-size: 20px;
            line-height: 24px;
            margin-top: 6px;
            margin-bottom: 12px;
            padding: 14px 12px;
            word-break: break-word;
          }
        `;
    }

    @property({ type: Array }) commits = [];
    @property({ type: Object }) checks = {};
    @property({ type: Object }) runs = {};
    @property({ type: Object }) artifacts = {};

    @property({ type: String }) selectedRepository = "";
    @property({ type: String }) selectedBranch = "";
    @property({ type: Boolean, reflect: true }) loading = false;

    render(){
        if (this.selectedBranch === "") {
            return html``;
        }
        if (this.loading) {
            return html`
                <span class="branch-commits-empty">Loading artifacts...</span>
            `
        }

        return html`
            <div class="branch-commits">
                ${this.commits.map((item) => {
                    let workflows = [];

                    for (let checkId in this.checks) {
                        const check = this.checks[checkId];
                        if (item.checks.indexOf(check.check_id) < 0) {
                            continue;
                        }

                        if (check.workflow == null || typeof this.runs[check.workflow] === "undefined") {
                            continue;
                        }

                        const run = this.runs[check.workflow];
                        if (run.artifacts.length === 0) {
                            continue;
                        }

                        workflows.push({
                            "name": run.name,
                            "name_sanitized": run.name.replace(/([^a-zA-Z0-9_\- ]+)/g, "").trim().toLowerCase(),
                            "check_id": check.check_id,
                            "artifacts": run.artifacts,
                        });
                    }

                    workflows.sort((a,b) => {
                        if (a.name_sanitized > b.name_sanitized) return 1;
                        if (a.name_sanitized < b.name_sanitized) return -1;
                        return 0;
                    });

                    return html`
                        <gr-commit-item
                            .hash="${item.hash}"
                            .title="${item.title}"
                            .committed_date="${item.committed_date}"
                            .workflows="${workflows}"
                            .repository="${this.selectedRepository}"
                        />
                    `;
                })}
            </div>
        `;
    }
}
