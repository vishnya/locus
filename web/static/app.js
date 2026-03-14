let state = { active: [], up_next: [], projects: [], done: [], notes: [] };

const PROJECT_COLORS = [
  { bg: "#2a2a40", fg: "#b8a9d4" },
  { bg: "#2a3530", fg: "#8bc6a8" },
  { bg: "#3a2a2a", fg: "#d4a0a0" },
  { bg: "#2a3040", fg: "#8ab4d4" },
  { bg: "#3a3528", fg: "#d4c08a" },
  { bg: "#2a3838", fg: "#8ac4c4" },
  { bg: "#3a2a35", fg: "#c9a0bf" },
  { bg: "#2e3a28", fg: "#a4c88a" },
  { bg: "#3a3030", fg: "#d4a87a" },
  { bg: "#28303a", fg: "#9ab0d0" },
];

function getProjectColor(name) {
  if (!name) return null;
  const idx = state.projects.findIndex((p) => p.name === name);
  return PROJECT_COLORS[idx >= 0 ? idx % PROJECT_COLORS.length : 0];
}

async function api(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  state = data;
  render();
  return data;
}

function render() {
  renderTasks("active-list", state.active, "active");
  renderTasks("next-list", state.up_next, "up_next");
  renderDone();
  renderProjects();
  document.querySelector(".active-header .section-count").textContent = `(${state.active.length})`;
  document.querySelector(".next-header .section-count").textContent = `(${state.up_next.length})`;
  document.querySelector(".done-header .section-count").textContent = `(${state.done.length})`;
}

// Track which tasks are expanded (by section:index key)
const expandedTasks = new Set();

function taskKey(section, index) {
  return section + ":" + index;
}

function parseNaturalDate(input) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const text = input.toLowerCase().trim();
  if (!text) return "";

  if (text === "today") return fmt(now);
  if (text === "tomorrow" || text === "tmw" || text === "tom") {
    const d = new Date(now); d.setDate(d.getDate() + 1); return fmt(d);
  }

  // "next week" = next Monday
  if (text === "next week") {
    const d = new Date(now);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return fmt(d);
  }

  // "in N days/weeks/months", "N days", "3d", "2w"
  let m = text.match(/^(?:in\s+)?(\d+)\s*(?:(d|day|days|w|week|weeks|m|month|months))$/);
  if (m) {
    const n = parseInt(m[1]);
    const u = m[2][0];
    const d = new Date(now);
    if (u === "d") d.setDate(d.getDate() + n);
    else if (u === "w") d.setDate(d.getDate() + n * 7);
    else if (u === "m") d.setMonth(d.getMonth() + n);
    return fmt(d);
  }

  // Day names: "friday", "next friday", "fri"
  const dayNames = ["sun","mon","tue","wed","thu","fri","sat"];
  const fullDays = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const isNext = text.startsWith("next ");
  const dayText = text.replace(/^next\s+/, "");
  for (let i = 0; i < 7; i++) {
    if (dayText === fullDays[i] || dayText === dayNames[i] || dayText === fullDays[i].slice(0, 4)) {
      const d = new Date(now);
      let ahead = i - d.getDay();
      if (ahead <= 0 || isNext) ahead += 7;
      if (isNext && ahead <= 7) ahead += 7;
      d.setDate(d.getDate() + ahead);
      return fmt(d);
    }
  }

  // "march 20", "mar 20", "jan 1"
  const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const fullMonths = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  for (let i = 0; i < 12; i++) {
    if (text.startsWith(fullMonths[i]) || text.startsWith(monthNames[i])) {
      const dayMatch = text.match(/\d+/);
      const day = dayMatch ? parseInt(dayMatch[0]) : 1;
      const d = new Date(now.getFullYear(), i, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return fmt(d);
    }
  }

  // ISO format passthrough "2026-03-20"
  if (text.match(/^\d{4}-\d{2}-\d{2}$/)) return text;

  // "3/20" or "3/20/2026"
  m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const yr = m[3] ? parseInt(m[3]) : now.getFullYear();
    const d = new Date(yr, parseInt(m[1]) - 1, parseInt(m[2]));
    if (d < now && !m[3]) d.setFullYear(d.getFullYear() + 1);
    return fmt(d);
  }

  return "";
}

function showDeleteConfirm(taskText, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-title">Delete task?</div>
    <div class="modal-text">${taskText.replace(/</g, "&lt;")}</div>
    <div class="modal-hint">Confirming skips this prompt for 24h</div>
    <div class="modal-actions">
      <button class="modal-cancel">Cancel</button>
      <button class="modal-confirm">Delete</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modal.querySelector(".modal-cancel").addEventListener("click", () => overlay.remove());
  modal.querySelector(".modal-confirm").addEventListener("click", () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

function fmt(d) {
  return d.toISOString().split("T")[0];
}

function linkifyInto(container, text) {
  // Markdown [title](url)
  const md = text.match(/^\[(.+?)\]\((.+?)\)$/);
  if (md) {
    const a = document.createElement("a");
    a.href = md[2]; a.textContent = md[1]; a.target = "_blank";
    container.appendChild(a);
    return;
  }
  // Split on URLs (https?:// or bare domains like foo.com/path)
  const urlRe = /(https?:\/\/[^\s]+|(?:[\w-]+\.)+(?:com|org|net|io|dev|co|edu|gov|app|me|xyz|ai|gg|tv|fm|ly|so|to|sh|cc|uk|de|fr|ru|jp|br|in|us|ca|au|it|nl|es|ch|se|no|fi|dk|pl|cz|sk|hu|ro|bg|hr|rs|si|lt|lv|ee|ie|pt|at|be|lu|gr|is|li|mt|cy|tr|za|nz|sg|hk|tw|kr|mx|ar|cl|co|pe|ve|uy|ec|bo|py|cr|pa|do|gt|hn|sv|ni|cu|jm|tt|bz|gy|sr)(?:\/[^\s]*)?)/gi;
  const parts = text.split(urlRe);
  parts.forEach((part) => {
    if (urlRe.lastIndex = 0, urlRe.test(part)) {
      const a = document.createElement("a");
      a.href = part.match(/^https?:\/\//) ? part : "https://" + part;
      a.textContent = part;
      a.target = "_blank";
      container.appendChild(a);
    } else if (part) {
      container.appendChild(document.createTextNode(part));
    }
  });
}

function deadlineLabel(dl) {
  if (!dl) return "";
  const d = new Date(dl + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d - now) / 86400000);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return `${diff}d`;
  return dl;
}

function deadlineClass(dl) {
  if (!dl) return "";
  const d = new Date(dl + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d - now) / 86400000);
  if (diff < 0) return "deadline-overdue";
  if (diff <= 1) return "deadline-urgent";
  if (diff <= 3) return "deadline-soon";
  return "deadline-normal";
}

function buildTaskEl(task, section, index, opts = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "task-wrapper";
  const key = taskKey(section, index);
  if (expandedTasks.has(key)) wrapper.classList.add("expanded");

  const div = document.createElement("div");
  div.className = "task";
  div.draggable = true;
  div.dataset.section = section;
  div.dataset.index = index;

  div.addEventListener("dragstart", onDragStart);
  div.addEventListener("dragend", onDragEnd);

  // Single click anywhere on row = expand/collapse
  // Double click on text = edit
  div.addEventListener("click", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
    if (expandedTasks.has(key)) expandedTasks.delete(key);
    else expandedTasks.add(key);
    wrapper.classList.toggle("expanded");
  });

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = task.done;
  if (opts.doneHandler) {
    cb.addEventListener("change", opts.doneHandler);
  } else {
    cb.addEventListener("change", () => api("task/done", { section, index }));
  }

  const text = document.createElement("div");
  text.className = "task-text";
  text.textContent = task.text;
  text.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    text.contentEditable = true;
    text.focus();
  });
  text.addEventListener("blur", () => {
    text.contentEditable = false;
    if (text.textContent !== task.text) {
      if (opts.editHandler) opts.editHandler(text.textContent);
      else api("task/edit", { section, index, text: text.textContent });
    }
  });
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); text.blur(); }
  });

  // Project pill (skip for project-internal tasks)
  if (!section.startsWith("project:")) {
    const proj = document.createElement("span");
    proj.className = "task-project";
    proj.textContent = task.project || "no project";
    const color = getProjectColor(task.project);
    if (color) {
      proj.style.background = color.bg;
      proj.style.color = color.fg;
    }
    div.appendChild(proj);
  }

  const del = document.createElement("button");
  del.className = "task-delete";
  del.textContent = "\ud83d\uddd1";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    const doDelete = () => {
      if (opts.deleteHandler) opts.deleteHandler();
      else api("task/delete", { section, index });
    };
    const skipUntil = localStorage.getItem("locus_skip_delete_confirm");
    if (skipUntil && Date.now() < parseInt(skipUntil)) {
      doDelete();
    } else {
      showDeleteConfirm(task.text, () => {
        localStorage.setItem("locus_skip_delete_confirm", String(Date.now() + 86400000));
        doDelete();
      });
    }
  });

  div.appendChild(cb);
  div.appendChild(text);
  div.appendChild(del);
  if (task.deadline) {
    const dlPill = document.createElement("span");
    dlPill.className = "task-deadline " + deadlineClass(task.deadline);
    dlPill.textContent = deadlineLabel(task.deadline);
    dlPill.title = task.deadline;
    div.appendChild(dlPill);
  }
  wrapper.appendChild(div);

  // Expandable sub-content
  const sub = document.createElement("div");
  sub.className = "task-sub";

  // Deadline row
  const dlRow = document.createElement("div");
  dlRow.className = "task-sub-row task-deadline-row";
  const dlLabel = document.createElement("span");
  dlLabel.className = "task-sub-label";
  dlLabel.textContent = "Due:";
  const dlInput = document.createElement("input");
  dlInput.type = "text";
  dlInput.className = "task-deadline-input";
  dlInput.placeholder = "tomorrow, fri, 3d, mar 20...";
  dlInput.value = task.deadline || "";
  dlInput.addEventListener("click", (e) => e.stopPropagation());
  dlInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      const parsed = parseNaturalDate(dlInput.value);
      if (parsed) api("task/deadline", { section, index, deadline: parsed });
      else dlInput.value = task.deadline || "";
    }
  });
  dlInput.addEventListener("blur", () => {
    const parsed = parseNaturalDate(dlInput.value);
    if (parsed) api("task/deadline", { section, index, deadline: parsed });
    else dlInput.value = task.deadline || "";
  });
  dlRow.appendChild(dlLabel);
  dlRow.appendChild(dlInput);
  if (task.deadline) {
    const dlClear = document.createElement("button");
    dlClear.className = "task-sub-delete";
    dlClear.textContent = "\u00d7";
    dlClear.addEventListener("click", (e) => {
      e.stopPropagation();
      api("task/deadline", { section, index, deadline: "" });
    });
    dlRow.appendChild(dlClear);
  }
  sub.appendChild(dlRow);

  // Notes (with auto-linkified URLs)
  (task.notes || []).forEach((note, ni) => {
    const row = document.createElement("div");
    row.className = "task-sub-row";
    linkifyInto(row, note);
    const nd = document.createElement("button");
    nd.className = "task-sub-delete";
    nd.textContent = "\u00d7";
    nd.addEventListener("click", (e) => {
      e.stopPropagation();
      api("task/delete_note", { section, index, sub_index: ni });
    });
    row.appendChild(nd);
    sub.appendChild(row);
  });

  // Add note input
  const addNoteRow = document.createElement("div");
  addNoteRow.className = "task-sub-add";
  const addNoteInput = document.createElement("input");
  addNoteInput.type = "text";
  addNoteInput.placeholder = "Add note or link...";
  addNoteInput.addEventListener("click", (e) => e.stopPropagation());
  addNoteInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      const val = addNoteInput.value.trim();
      if (val) { addNoteInput.value = ""; api("task/add_note", { section, index, text: val }); }
    }
  });
  addNoteRow.appendChild(addNoteInput);
  sub.appendChild(addNoteRow);

  wrapper.appendChild(sub);
  return wrapper;
}

function renderTasks(containerId, tasks, section) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  tasks.forEach((task, i) => {
    el.appendChild(buildTaskEl(task, section, i));
  });
}

function renderDone() {
  const el = document.getElementById("done-list");
  el.innerHTML = "";
  state.done.slice(0, 10).forEach((task, i) => {
    const div = document.createElement("div");
    div.className = "task";

    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = true; cb.disabled = true;

    const text = document.createElement("div");
    text.className = "task-text";
    text.textContent = task.text;

    const proj = document.createElement("span");
    proj.className = "task-project";
    proj.textContent = task.project || "";
    const doneColor = getProjectColor(task.project);
    if (doneColor) {
      proj.style.background = doneColor.bg;
      proj.style.color = doneColor.fg;
      proj.style.opacity = "0.5";
    }

    div.appendChild(cb);
    div.appendChild(text);
    if (task.project) div.appendChild(proj);
    el.appendChild(div);
  });
}

function renderProjects() {
  const el = document.getElementById("project-list");
  const collapsed = {};
  el.querySelectorAll(".project").forEach((p) => {
    const name = p.dataset.name;
    if (name) collapsed[name] = p.classList.contains("collapsed");
  });

  el.innerHTML = "";
  state.projects.forEach((proj) => {
    const div = document.createElement("div");
    div.className = "project";
    div.dataset.name = proj.name;
    if (collapsed[proj.name] === undefined || collapsed[proj.name]) {
      div.classList.add("collapsed");
    }

    const header = document.createElement("div");
    header.className = "project-header";
    header.addEventListener("click", () => div.classList.toggle("collapsed"));

    const arrow = document.createElement("span");
    arrow.className = "project-arrow";
    arrow.textContent = "\u25b6";

    const name = document.createElement("span");
    name.className = "project-name";
    name.textContent = proj.name;
    const projColor = getProjectColor(proj.name);
    if (projColor) name.style.color = projColor.fg;

    const backlogCount = (proj.tasks || []).length;
    const badge = document.createElement("span");
    badge.className = "project-badge";
    badge.textContent = backlogCount > 0 ? backlogCount : "";

    header.appendChild(arrow);
    header.appendChild(name);
    header.appendChild(badge);
    div.appendChild(header);

    const body = document.createElement("div");
    body.className = "project-body";

    const desc = document.createElement("div");
    desc.className = "project-desc";
    desc.contentEditable = true;
    desc.textContent = proj.description || "Add description...";
    desc.addEventListener("click", (e) => e.stopPropagation());
    desc.addEventListener("focus", () => {
      if (desc.textContent === "Add description...") desc.textContent = "";
    });
    desc.addEventListener("blur", () => {
      if (desc.textContent !== proj.description) {
        api("project/edit", { name: proj.name, description: desc.textContent });
      }
    });
    body.appendChild(desc);

    const taskList = document.createElement("div");
    taskList.className = "task-list project-task-list";
    taskList.dataset.section = "project:" + proj.name;
    taskList.addEventListener("dragover", onDragOver);
    taskList.addEventListener("dragleave", onDragLeave);
    taskList.addEventListener("drop", onDrop);

    (proj.tasks || []).forEach((task, i) => {
      const section = "project:" + proj.name;
      taskList.appendChild(buildTaskEl(task, section, i, {
        doneHandler: () => api("project/task/done", { name: proj.name, index: i }),
        deleteHandler: () => api("project/task/delete", { name: proj.name, index: i }),
      }));
    });

    body.appendChild(taskList);

    const addRow = document.createElement("div");
    addRow.className = "project-add-row";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "Add task...";
    addInput.addEventListener("click", (e) => e.stopPropagation());
    addInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        const val = addInput.value.trim();
        if (val) { addInput.value = ""; api("project/task/add", { name: proj.name, text: val }); }
      }
    });
    addRow.appendChild(addInput);
    body.appendChild(addRow);

    div.appendChild(body);
    el.appendChild(div);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("projects-header-toggle").addEventListener("click", () => {
    const projects = document.querySelectorAll("#project-list .project");
    const allCollapsed = Array.from(projects).every((p) => p.classList.contains("collapsed"));
    projects.forEach((p) => {
      if (allCollapsed) p.classList.remove("collapsed");
      else p.classList.add("collapsed");
    });
  });

  document.getElementById("add-project-btn").addEventListener("click", () => {
    const input = document.getElementById("add-project-input");
    const name = input.value.trim();
    if (!name) return;
    api("project/add", { name });
    input.value = "";
  });
  document.getElementById("add-project-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("add-project-btn").click();
  });

  document.getElementById("claude-btn").addEventListener("click", () => {
    fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  document.querySelectorAll(".task-list").forEach((list) => {
    list.addEventListener("dragover", onDragOver);
    list.addEventListener("dragleave", onDragLeave);
    list.addEventListener("drop", onDrop);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.target.closest("input, [contenteditable]")) {
      e.preventDefault();
      api("undo");
    }
  });

  api("priorities");
});

// Drag and drop
let dragData = null;

function onDragStart(e) {
  // Find the .task-wrapper or .task element
  const taskEl = e.target.closest(".task");
  if (!taskEl) return;
  dragData = {
    section: taskEl.dataset.section,
    index: parseInt(taskEl.dataset.index),
  };
  const wrapper = taskEl.closest(".task-wrapper") || taskEl;
  wrapper.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragEnd(e) {
  document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function onDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function getTasksForSection(section) {
  if (section === "active") return state.active;
  if (section === "up_next") return state.up_next;
  if (section.startsWith("project:")) {
    const proj = state.projects.find((p) => p.name === section.slice(8));
    return proj ? (proj.tasks || []) : [];
  }
  return [];
}

function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  if (!dragData) return;

  const targetSection = e.currentTarget.dataset.section;
  const fromSection = dragData.section;
  const fromIdx = dragData.index;

  const sourceTasks = getTasksForSection(fromSection);
  const task = sourceTasks[fromIdx];
  if (!task) return;

  sourceTasks.splice(fromIdx, 1);

  if (fromSection.startsWith("project:") && !targetSection.startsWith("project:")) {
    task.project = fromSection.slice(8);
  }

  const targetTasks = getTasksForSection(targetSection);

  const taskEls = Array.from(e.currentTarget.querySelectorAll(":scope > .task-wrapper > .task, :scope > .task"));
  let insertIdx = taskEls.length;
  for (let i = 0; i < taskEls.length; i++) {
    const rect = taskEls[i].getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      insertIdx = i;
      break;
    }
  }

  targetTasks.splice(insertIdx, 0, task);

  const payload = { active: state.active, up_next: state.up_next, projects: {} };
  const affected = new Set();
  if (fromSection.startsWith("project:")) affected.add(fromSection.slice(8));
  if (targetSection.startsWith("project:")) affected.add(targetSection.slice(8));
  affected.forEach((name) => {
    const proj = state.projects.find((p) => p.name === name);
    if (proj) payload.projects[name] = proj.tasks || [];
  });

  api("reorder", payload);
  dragData = null;
}
