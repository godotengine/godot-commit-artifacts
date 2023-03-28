import { LitElement, html, css, customElement, property } from 'lit-element';

@customElement('gr-branch-item')
export default class BranchItem extends LitElement {
    static get styles() {
        return css`
          /** Colors and variables **/
          :host {
            --tab-hover-background-color: rgba(0, 0, 0, 0.14);
            --tab-active-background-color: #d6e6ff;
            --tab-active-border-color: #397adf;
          }
          @media (prefers-color-scheme: dark) {
            :host {
              --tab-hover-background-color: rgba(255, 255, 255, 0.14);
              --tab-active-background-color: #283446;
              --tab-active-border-color: #5394f9;
            }
          }

          /** Component styling **/
          :host {
            max-width: 200px;
          }

          :host .branch-item {
            border-left: 5px solid transparent;
            color: var(--g-font-color);
            cursor: pointer;
            display: flex;
            flex-direction: row;
            gap: 6px;
            padding: 6px 16px;
            align-items: center;
          }
          :host .branch-item:hover {
            background-color: var(--tab-hover-background-color);
          }
          :host .branch-item--active {
            background-color: var(--tab-active-background-color);
            border-left: 5px solid var(--tab-active-border-color);
          }

          :host .branch-title {
            flex-grow: 1;
            font-size: 15px;
            white-space: nowrap;
            overflow: hidden;
          }

          @keyframes loader-rotate {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          :host .branch-loader {
            background-image: url('loader.svg');
            background-size: 20px 20px;
            background-position: 50% 50%;
            background-repeat: no-repeat;
            border-radius: 2px;
            display: inline-block;
            width: 20px;
            height: 20px;
            min-width: 20px;
            animation-name: loader-rotate;
            animation-duration: 1.25s;
            animation-timing-function: steps(8);
            animation-iteration-count: infinite;
          }

          @media (prefers-color-scheme: light) {
            :host .branch-loader {
              filter: invert(1);
            }
          }

          @media only screen and (max-width: 900px) {
            :host .branch-item {
              padding: 10px 20px;
            }

            :host .branch-title {
              font-size: 18px;
            }
          }
        `;
    }

    @property({ type: String, reflect: true }) name = "";
    @property({ type: Boolean, reflect: true }) active = false;
    @property({ type: Boolean, reflect: true }) loading = false;

    render(){
        const classList = [ "branch-item" ];
        if (this.active) {
            classList.push("branch-item--active");
        }

        return html`
            <div
              class="${classList.join(" ")}"
              title="${this.name}"
            >
                <span class="branch-title">
                    ${this.name}
                </span>

                ${(this.loading ? html`
                  <div class="branch-loader"></div>
                ` : null)}
            </div>
        `;
    }
}
