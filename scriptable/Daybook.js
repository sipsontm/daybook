// Daybook for Scriptable — home & lock screen widgets, tap-to-complete list, Siri/Shortcuts quick add.
// Widget "Parameter": a project name (e.g. 123QR) to show only that project. Empty = everything.

const KEY = "daybook-link";
const FG = Color.dynamic(new Color("#000000"), new Color("#ffffff"));
const MUTED = Color.dynamic(new Color("#6b6b6b"), new Color("#9b9b9b"));
const FAINT = Color.dynamic(new Color("#b0b0b0"), new Color("#5c5c5c"));
const BG = Color.dynamic(new Color("#ffffff"), new Color("#000000"));
const fm = FileManager.local();

/* ---------- connection ---------- */
function parseLink(raw) {
  const s = String(raw || "").trim(), i = s.indexOf("token=");
  if (!/^https:\/\//.test(s) || i < 0) return null;
  const token = s.slice(i + 6).split(/[&#\s]/)[0], url = s.split(/[?#]/)[0];
  return token ? { url, token } : null;
}
function savedLink() {
  if (!Keychain.contains(KEY)) return null;
  try { return JSON.parse(Keychain.get(KEY)); } catch (e) { return null; }
}
async function notice(title, message) {
  const a = new Alert(); a.title = title; if (message) a.message = message; a.addAction("OK"); await a.presentAlert();
}
async function askLink() {
  const a = new Alert();
  a.title = "Connect Daybook";
  a.addTextField("Paste connect link", "");
  a.addAction("Connect"); a.addCancelAction("Cancel");
  if (await a.presentAlert() === -1) return null;
  const c = parseLink(a.textFieldValue(0));
  if (!c) { await notice("Link must end with ?token=…"); return null; }
  try { await call(c, { action: "widget" }); } catch (e) { await notice("Couldn’t connect", e.message); return null; }
  Keychain.set(KEY, JSON.stringify(c));
  return c;
}
async function call(c, params) {
  const q = Object.entries(Object.assign({}, params, { token: c.token }))
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
  const r = new Request(c.url + "?" + q);
  r.timeoutInterval = 25;
  let res;
  try { res = await r.loadJSON(); } catch (e) { throw new Error("Offline"); }
  if (!res || !res.ok) throw new Error((res && res.error) || "Server error");
  return res.result;
}
function cachePath(project) {
  return fm.joinPath(fm.cacheDirectory(), "daybook-" + (project || "all").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json");
}
async function load(c, project) {
  try {
    const d = await call(c, { action: "widget", project });
    fm.writeString(cachePath(project), JSON.stringify(d));
    return d;
  } catch (e) {
    const p = cachePath(project);
    if (fm.fileExists(p)) return Object.assign(JSON.parse(fm.readString(p)), { stale: true });
    throw e;
  }
}
function runUrl(params) {
  const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  return "scriptable:///run/" + encodeURIComponent(Script.name()) + (q ? "?" + q : "");
}
function clean(t) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return /^https?:\/\/\S+$/.test(s) ? s.replace(/^https?:\/\/(www\.)?/, "") : s;
}

/* ---------- widgets ---------- */
function text(stack, value, font, color, lines) {
  const t = stack.addText(value); t.font = font; t.textColor = color || FG; t.lineLimit = lines || 1; return t;
}
function taskRow(w, item, size, project) {
  const s = w.addStack();
  s.layoutHorizontally(); s.centerAlignContent(); s.spacing = 8;
  s.url = runUrl({ done: item.id, project });
  const img = s.addImage(SFSymbol.named("circle").image);
  img.imageSize = new Size(size - 2, size - 2); img.tintColor = FAINT;
  text(s, clean(item.text), Font.mediumSystemFont(size));
  s.addSpacer();
}
function flat(d) {
  return d.projects.reduce((all, p) => all.concat(p.items.map(i => Object.assign({ project: p.name }, i))), []);
}
function emptyState(w, size) {
  w.addSpacer();
  const s = w.addStack(); s.layoutHorizontally(); s.addSpacer();
  const img = s.addImage(SFSymbol.named("checkmark.circle").image);
  img.imageSize = new Size(size, size); img.tintColor = FG;
  s.addSpacer(); w.addSpacer();
}

function buildWidget(d, family, project) {
  const w = new ListWidget();
  const items = flat(d), title = project ? (d.projects[0] ? d.projects[0].name : project) : "";
  w.url = runUrl({ project });
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  if (family === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const s = w.addStack(); s.layoutHorizontally(); s.addSpacer();
    text(s, String(d.open), Font.boldRoundedSystemFont(26));
    s.addSpacer();
    return w;
  }
  if (family === "accessoryInline") {
    text(w, d.open ? d.open + " · " + clean(items[0].text) : "All clear", Font.systemFont(14));
    return w;
  }
  if (family === "accessoryRectangular") {
    if (!items.length) { text(w, "All clear", Font.boldSystemFont(15)); return w; }
    items.slice(0, 3).forEach((it, k) => text(w, clean(it.text), k === 0 ? Font.boldSystemFont(15) : Font.systemFont(14)));
    return w;
  }

  w.backgroundColor = BG;
  if (family === "small") {
    w.setPadding(16, 16, 16, 16);
    const head = w.addStack(); head.layoutHorizontally(); head.bottomAlignContent();
    text(head, String(d.open), Font.boldRoundedSystemFont(40));
    if (title) { head.addSpacer(8); const t = text(head, title, Font.semiboldSystemFont(13), MUTED); t.minimumScaleFactor = 0.7; }
    head.addSpacer();
    w.addSpacer(8);
    if (!items.length) { emptyState(w, 30); return w; }
    items.slice(0, 2).forEach(it => { text(w, clean(it.text), Font.semiboldSystemFont(15), FG, 2); w.addSpacer(6); });
    w.addSpacer();
    return w;
  }

  const large = family === "large" || family === "extraLarge";
  w.setPadding(18, 20, 18, 20);
  const head = w.addStack(); head.layoutHorizontally(); head.centerAlignContent();
  text(head, title || "Open", Font.boldSystemFont(17));
  head.addSpacer();
  text(head, String(d.open), Font.boldRoundedSystemFont(17), MUTED);
  w.addSpacer(10);
  if (!items.length) { emptyState(w, 40); return w; }

  if (!large) {
    items.slice(0, 4).forEach((it, k) => { if (k) w.addSpacer(8); taskRow(w, it, 16, project); });
    w.addSpacer();
    return w;
  }
  // Large: grouped by project, ~11 lines.
  let budget = family === "extraLarge" ? 13 : 11;
  const groups = d.projects.filter(p => p.items.length);
  for (const p of groups) {
    if (budget < 2) break;
    if (!project && groups.length > 1) { w.addSpacer(6); text(w, p.name, Font.boldSystemFont(13), MUTED); w.addSpacer(4); budget--; }
    for (const it of p.items) {
      if (budget < 1) break;
      taskRow(w, it, 16, project); w.addSpacer(6); budget--;
    }
  }
  w.addSpacer();
  return w;
}

function messageWidget(msg) {
  const w = new ListWidget(); w.backgroundColor = BG; w.url = runUrl({});
  w.addSpacer(); text(w, msg, Font.semiboldSystemFont(15), MUTED, 3); w.addSpacer();
  return w;
}

/* ---------- in-app list ---------- */
async function quickAdd(c, project, d) {
  const a = new Alert();
  a.addTextField("New card", "");
  const names = project ? [] : d.projects.map(p => p.name);
  if (project) a.addAction("Add"); else names.forEach(n => a.addAction(n));
  a.addCancelAction("Cancel");
  const pick = await a.presentAlert();
  const value = a.textFieldValue(0).trim();
  if (pick === -1 || !value) return false;
  await call(c, { action: "add", text: value, project: project || names[pick] });
  return true;
}

async function presentList(c, project) {
  const table = new UITable();
  table.showSeparators = true;
  let data = await load(c, project), undo = null;

  function rowHeight(s) { return 34 + 26 * Math.max(1, Math.ceil(s.length / 28)); }
  async function refresh() { data = await load(c, project); build(); table.reload(); }

  function build() {
    table.removeAllRows();
    const top = new UITableRow(); top.height = 84;
    const count = top.addText(String(data.open)); count.titleFont = Font.boldRoundedSystemFont(40); count.widthWeight = 70;
    const add = top.addButton("+"); add.titleFont = Font.lightSystemFont(40); add.rightAligned(); add.widthWeight = 30; add.dismissOnTap = false;
    add.onTap = async () => { try { if (await quickAdd(c, project, data)) await refresh(); } catch (e) { await notice(e.message); } };
    table.addRow(top);

    if (undo) {
      const u = new UITableRow(); u.height = 56; u.dismissOnSelect = false;
      const cell = u.addText("Undo · " + clean(undo.text)); cell.titleFont = Font.mediumSystemFont(16); cell.titleColor = MUTED;
      u.onSelect = async () => { const last = undo; undo = null; try { await call(c, { action: "toggle", id: last.id }); await refresh(); } catch (e) { await notice(e.message); } };
      table.addRow(u);
    }

    const groups = data.projects.filter(p => p.items.length || project);
    for (const p of groups) {
      if (!project || groups.length > 1) {
        const h = new UITableRow(); h.isHeader = true; h.height = 64;
        const t = h.addText(p.name); t.titleFont = Font.boldSystemFont(24);
        table.addRow(h);
      }
      for (const it of p.items) {
        const label = clean(it.text), r = new UITableRow();
        r.height = rowHeight(label); r.dismissOnSelect = false;
        const t = r.addText(label); t.titleFont = Font.mediumSystemFont(19);
        r.onSelect = async () => {
          try {
            await call(c, { action: "toggle", id: it.id });
            p.items = p.items.filter(x => x.id !== it.id); data.open--; undo = it;
            build(); table.reload();
          } catch (e) { await notice(e.message); }
        };
        table.addRow(r);
      }
    }
    if (!data.open) {
      const e = new UITableRow(); e.height = 120;
      const t = e.addText("All clear"); t.titleFont = Font.semiboldSystemFont(20); t.titleColor = MUTED; t.centerAligned();
      table.addRow(e);
    }
  }
  build();
  await table.present(false);
}

/* ---------- entry ---------- */
async function main() {
  const qp = args.queryParameters || {};
  const project = String(args.widgetParameter || qp.project || "").trim();

  if (config.runsInWidget) {
    const c = savedLink();
    let w;
    if (!c) w = messageWidget("Tap to connect");
    else {
      try { w = buildWidget(await load(c, project), config.widgetFamily, project); }
      catch (e) { w = messageWidget(e.message === "Unauthorized" ? "Reconnect" : "Offline"); }
    }
    Script.setWidget(w);
    return;
  }

  let c = savedLink();
  if (!c) c = await askLink();
  if (!c) return;

  // Siri / Shortcuts / URL: add a card. Shortcut input can be text or {"text": "...", "project": "..."}.
  const sp = args.shortcutParameter;
  const addText = (typeof sp === "string" ? sp : sp && sp.text) || (args.plainTexts && args.plainTexts[0]) || qp.add;
  if (addText) {
    const r = await call(c, { action: "add", text: addText, project: (sp && sp.project) || qp.project });
    Script.setShortcutOutput("Added to " + r.project);
    if (config.runsInApp && !config.runsWithSiri) await presentList(c, project);
    return;
  }

  // Tapped a card on a widget.
  if (qp.done) {
    const d = await load(c, project), it = flat(d).find(i => i.id === qp.done);
    if (it) {
      const a = new Alert(); a.title = clean(it.text); a.addAction("Done"); a.addCancelAction("Cancel");
      if (await a.presentAlert() === 0) await call(c, { action: "toggle", id: it.id });
    }
  }

  if (config.runsInApp) await presentList(c, project);
}

try { await main(); } catch (e) { if (config.runsInApp) await notice(e.message); }
Script.complete();
