import { LitElement, html, css, customElement, property } from 'lit-element';

@customElement('gr-commit-item')
export default class CommitItem extends LitElement {
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
            border-bottom: 2px solid var(--g-background-extra-color);
            padding: 12px 10px;
          }

          :host .workflow-artifacts {
            display: flex;
            flex-direction: column;
            gap: 6px;
            color: var(--dimmed-font-color);
            font-size: 14px;
          }

          :host .workflow-artifacts a {
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

    @property({ type: String, reflect: true }) hash = '';
    @property({ type: String }) title = '';
    @property({ type: Array }) workflows = [];

    @property({ type: String }) repository = '';

    render(){
        return html`
            <div class="item-container">
                <div class="item-title">
                    <span>${greports.format.formatTimestamp(this.committed_date)}</span>
                    <a
                        href="https://github.com/${this.repository}/commit/${this.hash}"
                        target="_blank"
                        title="Open commit #${this.hash} on GitHub"
                    >
                        #${this.hash.substring(0, 9)}
                    </a>
                </div>
                <div class="item-subtitle">${this.title}</div>
                <div class="item-workflows">
                    ${this.workflows.map((item) => {
                        return html`
                            <div class="workflow">
                                <div class="workflow-name">${item.name}</div>
                                <div class="workflow-artifacts">
                                    ${item.artifacts.map((artifact) => {
                                        return html`
                                            <span>
                                                <a
                                                    href="https://github.com/godotengine/godot/suites/${item.check_id}/artifacts/${artifact.id}"
                                                    target="_blank"
                                                >
                                                    ${artifact.name}
                                                </a>
                                                <span>(${greports.format.humanizeBytes(artifact.size)})</span>
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
