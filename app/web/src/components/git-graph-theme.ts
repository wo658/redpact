// The pinned renderer keeps these colors in SVG attributes and inline branch styles.
const laneColors = ["#e3008c", "#007acc", "#00c853", "#ff8c00", "#b180d7", "#00b7c3", "#dcdcaa"]
const laneTokens = [
  "--git-graph-blue",
  "--git-graph-green",
  "--git-graph-purple",
  "--git-graph-orange",
  "--git-graph-pink",
  "--git-graph-yellow",
  "--git-graph-red",
]

export function applyGitGraphTheme(graph: HTMLElement) {
  const style = document.createElement("style")
  style.dataset.redpactTheme = ""
  style.textContent = `
    .shell {
      --wgg-bg: var(--card);
      --wgg-panel: var(--card);
      --wgg-panel-raised: var(--popover);
      --wgg-ink: var(--card-foreground);
      --wgg-muted: var(--muted-foreground);
      --wgg-faint: var(--muted-foreground);
      --wgg-line: var(--border);
      --wgg-hover: color-mix(in oklab, var(--accent) 50%, transparent);
      --wgg-selected: var(--accent);
      --wgg-accent: var(--ring);
      --wgg-warning: var(--destructive);
      --wgg-remote: var(--muted-foreground);
      background: var(--card);
      color: var(--card-foreground);
    }
    .toolbar {
      min-height: 44px;
      flex-wrap: wrap;
      gap: 8px 12px;
      padding: 8px 12px;
      font-family: inherit;
    }
    .branch-control strong, .repository-name, .refresh, .theme-toggle { display: none; }
    .branch-control { min-width: 0; }
    .ref-select {
      border-color: transparent;
      border-radius: 9999px;
      background: transparent;
      padding-inline: 10px;
      font-weight: 500;
    }
    .ref-select[aria-expanded="true"] { background: var(--accent); }
    .remote-control { font-weight: 400; color: var(--muted-foreground); }
    .tools { min-width: 0; flex-wrap: wrap; gap: 8px; }
    .find { min-width: 0; }
    .search {
      width: min(200px, 32cqw);
      border-radius: 8px;
      background: var(--background);
      border-color: var(--input);
    }
    .icon-button { border-radius: 9999px; }
    .menu { border-radius: 12px; padding: 4px; }
    .menu-item { border-radius: 8px; }
    button:focus-visible, .search:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: 2px;
    }
    @container wgg (max-width: 760px) {
      .header > .col-date, .header > .col-author { display: none; }
    }
    @container (max-width: 520px) {
      .tools { flex: 1 1 100%; }
      .find { flex: 1; }
      .search { width: 100%; min-width: 0; }
    }
    .row.selected, .row.selected .message, .row.selected .author,
    .row.selected .date, .row.selected .oid, .tree-file.active {
      color: var(--accent-foreground);
    }
    .menu { color: var(--popover-foreground); box-shadow: var(--shadow-md); }
    .menu-item:hover:not(:disabled) { color: var(--accent-foreground); }
    .ref {
      border-radius: 4px;
      border-color: color-mix(in srgb, var(--ref-color) 65%, transparent);
      background: color-mix(in srgb, var(--ref-color) 12%, transparent);
      color: var(--card-foreground);
      font-size: 11px;
      line-height: 18px;
    }
    .ref.remote {
      border-style: dashed;
      border-color: var(--ref-color);
      background: color-mix(in srgb, var(--ref-color) 8%, transparent);
      color: var(--card-foreground);
    }
    .ref.current {
      background: var(--ref-color);
      border-color: var(--ref-color);
      color: var(--git-graph-on-lane);
    }
    .ref.tag { --ref-color: var(--git-graph-yellow) !important; }
    .ref.stash { --ref-color: var(--git-graph-pink) !important; }
    .ref.tag, .ref.stash {
      background: color-mix(in srgb, var(--ref-color) 12%, transparent);
      color: var(--card-foreground);
    }
    .avatar { background: var(--muted); color: var(--muted-foreground); }
    .action.primary {
      border-color: var(--primary);
      background: var(--primary);
      color: var(--primary-foreground);
    }
    .error, .change-code.delete { color: var(--destructive); }
    .change-code.add { color: var(--diff-insert); }
    .change-code.modify { color: var(--destructive); }
    .change-code.rename, .change-code.copy { color: var(--muted-foreground); }
    ${laneColors
      .map(
        (color, index) => `
      .graph [stroke="${color}"] { stroke: var(${laneTokens[index]}); }
      .graph [fill="${color}"] { fill: var(${laneTokens[index]}); }
      .ref[style*="${color}"] { --ref-color: var(${laneTokens[index]}) !important; }
    `,
      )
      .join("\n")}
  `
  graph.shadowRoot?.append(style)
}
