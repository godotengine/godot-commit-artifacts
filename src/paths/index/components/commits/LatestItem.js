import { LitElement, html, css, customElement, property } from 'lit-element';

@customElement('gr-latest-item')
export default class LatestItem extends LitElement {
    static get styles() {
        return css`
          /** Colors and variables **/
          :host {
            --item-border-color: #fcfcfa;
          }

          @media (prefers-color-scheme: dark) {
            :host {
              --item-border-color: #0d1117;
            }
          }

          /** Component styling **/
          :host {
            border-bottom: 3px solid var(--item-border-color);
            display: block;
            padding: 14px 12px 20px 12px;
          }

          :host a {
            color: var(--link-font-color);
            text-decoration: none;
          }
          :host a:hover {
            color: var(--link-font-color-hover);
          }

          :host .item-title {
            display: inline-flex;
            justify-content: space-between;
            font-size: 20px;
            margin-top: 6px;
            margin-bottom: 12px;
            width: 100%;
          }

          :host .item-subtitle {
            color: var(--dimmed-font-color);
            font-size: 16px;
            line-height: 20px;
            word-break: break-word;
          }

          :host .item-workflows {
            margin-top: 12px;
          }

          :host .workflow {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            padding: 12px 10px;
          }
          :host .workflow + .workflow {
            border-top: 2px solid var(--g-background-extra-color);
          }

          :host .workflow-artifacts {
            display: flex;
            flex-direction: column;
            gap: 6px;
            color: var(--dimmed-font-color);
            font-size: 14px;
          }

          :host .workflow-artifacts a.workflow-artifact-link {
            font-size: 15px;
            font-weight: 600;
          }

          @media only screen and (max-width: 900px) {
            :host {
              padding: 14px 0 20px 0;
            }

            :host .workflow {
                grid-template-columns: 1fr;
            }
          }

          @media only screen and (max-width: 640px) {
            :host .item-container {
                padding: 0 10px;
            }
          }
        `;
    }

    @property({ type: Object }) artifacts = {};

    @property({ type: String }) repository = '';
    @property({ type: String }) branch = '';

    constructor() {
        super();

        this._latestByWorkflow = [];
    }

    _updateWorkflows() {
        this._latestByWorkflow = [];
        const existingWorkflow = {};

        for (let artifactName in this.artifacts) {
            const artifact = this.artifacts[artifactName];

            if (typeof existingWorkflow[artifact.workflow_name] === "undefined") {
                existingWorkflow[artifact.workflow_name] = {
                    "name": artifact.workflow_name,
                    "name_sanitized": artifact.workflow_name.replace(/([^a-zA-Z0-9_\- ]+)/g, "").trim().toLowerCase(),
                    "artifacts": [],
                };
                this._latestByWorkflow.push(existingWorkflow[artifact.workflow_name]);
            }

            existingWorkflow[artifact.workflow_name].artifacts.push(artifact);
        }

        this._latestByWorkflow.sort((a,b) => {
            if (a.name_sanitized > b.name_sanitized) return 1;
            if (a.name_sanitized < b.name_sanitized) return -1;
            return 0;
        });
    }

    update(changedProperties) {
        // Only recalculate when class properties change; skip for manual updates.
        if (changedProperties.size > 0) {
            this._updateWorkflows();
        }

        super.update(changedProperties);
    }

    render(){
        return html`
            <div class="item-container">
                <div class="item-title">
                    <span>Latest</span>
                </div>
                <div class="item-subtitle">Builds may be from different runs, depending on their availability.</div>
                <div class="item-workflows">
                    ${this._latestByWorkflow.map((item) => {
                        return html`
                            <div class="workflow">
                                <div class="workflow-name">${item.name}</div>
                                <div class="workflow-artifacts">
                                    ${item.artifacts.map((artifact) => {
                                        return html`
                                            <span>
                                                <a
                                                    class="workflow-artifact-link"
                                                    href="download/${this.repository}/${this.branch}/${artifact.artifact_name}"
                                                    target="_blank"
                                                >
                                                    ${artifact.artifact_name}
                                                </a>
                                                <span>
                                                    (${greports.format.humanizeBytes(artifact.artifact_size)},
                                                    <a
                                                        href="https://github.com/${this.repository}/commit/${artifact.commit_hash}"
                                                        target="_blank"
                                                        title="Open commit #${this.hash} on GitHub"
                                                    >#${artifact.commit_hash.substring(0, 6)}</a>)
                                                </span>
                                            </span>
                                        `;
                                    })}
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }
}
