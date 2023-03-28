import { LitElement, html, css, customElement, property } from 'lit-element';

import BranchItem from "./BranchItem";

@customElement('gr-branch-list')
export default class BranchList extends LitElement {
    static get styles() {
        return css`
          /** Colors and variables **/
          :host {
            --branches-background-color: #fcfcfa;
            --branches-border-color: #515c6c;
          }
          @media (prefers-color-scheme: dark) {
            :host {
              --branches-background-color: #0d1117;
              --branches-border-color: #515c6c;
            }
          }

          /** Component styling **/
          :host {
            position: relative;
          }

          :host .branch-list {
            background-color: var(--branches-background-color);
            border-right: 2px solid var(--branches-border-color);
            width: 200px;
            min-height: 216px;
          }

          @media only screen and (max-width: 900px) {
            :host {
              width: 100%
            }

            :host .branch-list {
              width: 100% !important;
            }
          }
        `;
    }

    @property({ type: Array }) branches = [];
    @property({ type: Array }) loadingBranchess = [];
    @property({ type: String }) selectedBranch = "";

    _onItemClicked(branchName) {
      this.dispatchEvent(greports.util.createEvent("branchclick", {
          "branch": branchName,
      }));
    }

    render() {
        return html`
            <div class="branch-list">
                ${this.branches.map((item) => {
                    return html`
                        <div class="branch-list-main">
                            <gr-branch-item
                                .name="${item}"
                                ?active="${this.selectedBranch === item}"
                                ?loading="${this.loadingBranches.includes(item)}"
                                @click="${this._onItemClicked.bind(this, item)}"
                            ></gr-branch-item>
                        </div>
                    `;
                })}
            </div>
        `;
    }
}
