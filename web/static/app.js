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
  syncTaskSectionLevel("active-section", "active-list", "active");
  syncTaskSectionLevel("next-section", "next-list", "up_next");
}

function syncTaskSectionLevel(sectionId, listId, stateKey) {
  const section = document.getElementById(sectionId);
  if (section.classList.contains("collapsed")) {
    sectionExpandLevels[stateKey] = 0;
    return;
  }
  const wrappers = document.querySelectorAll(`#${listId} .task-wrapper`);
  if (wrappers.length === 0) {
    sectionExpandLevels[stateKey] = 1;
    return;
  }
  const allExpanded = Array.from(wrappers).every((w) => w.classList.contains("expanded"));
  sectionExpandLevels[stateKey] = allExpanded ? 2 : 1;
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
    if (e.target.isContentEditable) return;
    if (e.target.closest(".task-priority")) return;
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
    const range = document.createRange();
    range.selectNodeContents(text);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  text.addEventListener("blur", () => {
    text.contentEditable = false;
    const newText = text.textContent.trim();
    if (newText && newText !== task.text) {
      if (opts.editHandler) opts.editHandler(newText);
      else api("task/edit", { section, index, text: newText });
    }
  });
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); text.blur(); }
    if (e.key === "Escape") { text.textContent = task.text; text.blur(); }
  });
  text.addEventListener("click", (e) => {
    if (text.isContentEditable) e.stopPropagation();
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

  // Priority indicator (clickable !/!! toggle)
  const pri = document.createElement("span");
  pri.className = "task-priority";
  if (task.priority === 2) pri.classList.add("task-priority-2");
  else if (task.priority === 1) pri.classList.add("task-priority-1");
  pri.innerHTML = '<span class="pri-mark" data-n="1">!</span><span class="pri-mark" data-n="2">!</span>';
  pri.addEventListener("click", (e) => {
    e.stopPropagation();
    const mark = e.target.closest(".pri-mark");
    if (!mark) return;
    const clicked = parseInt(mark.dataset.n);
    // Click highest active mark to deselect one level; click higher to escalate
    let newPri;
    if (clicked === task.priority) newPri = clicked - 1;  // toggle down (2→1, 1→0)
    else newPri = clicked;
    api("task/priority", { section, index, priority: newPri });
  });

  div.appendChild(cb);
  div.appendChild(pri);
  div.appendChild(text);
  div.appendChild(del);
  {
    const dlPill = document.createElement("span");
    if (task.deadline) {
      dlPill.className = "task-deadline " + deadlineClass(task.deadline);
      dlPill.textContent = deadlineLabel(task.deadline);
      dlPill.title = task.deadline;
    } else {
      dlPill.className = "task-deadline task-deadline-empty";
      dlPill.textContent = "due";
    }
    dlPill.style.cursor = "pointer";
    dlPill.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "text";
      input.className = "task-deadline-picker";
      input.value = task.deadline || "";
      input.placeholder = "tomorrow, fri, 3d...";
      dlPill.replaceWith(input);
      input.focus();
      if (task.deadline) input.select();
      const commit = () => {
        const parsed = parseNaturalDate(input.value);
        if (parsed) {
          api("task/deadline", { section, index, deadline: parsed });
        } else {
          input.replaceWith(dlPill);
        }
      };
      input.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") { ev.preventDefault(); commit(); }
        if (ev.key === "Escape") { input.replaceWith(dlPill); }
      });
      input.addEventListener("blur", commit);
    });
    div.appendChild(dlPill);
    if (task.deadline) {
      const dlClear = document.createElement("button");
      dlClear.className = "task-deadline-clear";
      dlClear.textContent = "\u00d7";
      dlClear.title = "Remove deadline";
      dlClear.addEventListener("click", (e) => {
        e.stopPropagation();
        api("task/deadline", { section, index, deadline: "" });
      });
      div.appendChild(dlClear);
    }
  }
  wrapper.appendChild(div);

  // Expandable sub-content
  const sub = document.createElement("div");
  sub.className = "task-sub";

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

let doneSearchQuery = "";
let projectsExpandLevel = 1; // 0=section hidden, 1=cards collapsed, 2=cards expanded
let sectionExpandLevels = { active: 1, up_next: 1 }; // 0=hidden, 1=tasks collapsed, 2=tasks expanded

function renderDone() {
  const el = document.getElementById("done-list");
  el.innerHTML = "";
  const q = doneSearchQuery.toLowerCase().trim();

  if (q) {
    renderDoneSearch(el, q);
  } else {
    renderDoneRecent(el);
  }
}

function renderDoneRecent(el) {
  if (state.done.length === 0) return;

  const label = document.createElement("div");
  label.className = "done-recent-label";
  label.textContent = "Recent";
  el.appendChild(label);

  const scroll = document.createElement("div");
  scroll.className = "done-recent-scroll";
  state.done.slice(0, 10).forEach((task) => {
    scroll.appendChild(buildDoneRow(task));
  });
  el.appendChild(scroll);
}

function renderDoneSearch(el, q) {
  // Find all projects matching the query (active or archived)
  const matchedProjects = state.projects.filter((p) =>
    p.name.toLowerCase().includes(q)
  );

  // Find done tasks matching by text (not project name -- those show under project cards)
  const taskTextMatches = state.done.filter((t) =>
    t.text.toLowerCase().includes(q) &&
    !matchedProjects.some((p) => p.name === t.project)
  );

  let hasResults = false;

  // Show each matching project as a card with its history
  matchedProjects.forEach((proj) => {
    const projDone = state.done.filter((t) => t.project === proj.name);
    const backlogTasks = proj.tasks || [];
    if (projDone.length === 0 && backlogTasks.length === 0 && isProjectActive(proj)) return;

    hasResults = true;
    const card = document.createElement("div");
    card.className = "done-project-card";

    // Card header
    const header = document.createElement("div");
    header.className = "done-project-header";
    const nameEl = document.createElement("span");
    nameEl.className = "done-project-name";
    nameEl.textContent = proj.name;
    const projColor = getProjectColor(proj.name);
    if (projColor) nameEl.style.color = projColor.fg;
    header.appendChild(nameEl);

    if (proj.description) {
      const desc = document.createElement("span");
      desc.className = "done-project-desc";
      desc.textContent = proj.description;
      header.appendChild(desc);
    }

    if (!isProjectActive(proj)) {
      const restoreBtn = document.createElement("button");
      restoreBtn.className = "done-project-restore";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Swap button for task input
        restoreBtn.remove();
        const inputRow = document.createElement("div");
        inputRow.className = "done-search-restore-row";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "done-search-restore-input";
        input.placeholder = "Add a task to reactivate...";
        inputRow.appendChild(input);
        header.after(inputRow);
        input.focus();
        input.addEventListener("keydown", (ev) => {
          ev.stopPropagation();
          if (ev.key === "Enter") {
            ev.preventDefault();
            const text = input.value.trim();
            if (text) {
              fetch("/api/project/archive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: proj.name, archived: false }),
              }).then(() => {
                api("project/task/add", { name: proj.name, text });
                document.getElementById("done-search-input").value = "";
                doneSearchQuery = "";
              });
            }
          } else if (ev.key === "Escape") {
            inputRow.remove();
            header.appendChild(restoreBtn);
          }
        });
      });
      header.appendChild(restoreBtn);
    }

    card.appendChild(header);

    // Backlog tasks still in the project
    if (backlogTasks.length > 0) {
      const section = document.createElement("div");
      section.className = "done-project-section";
      const sLabel = document.createElement("div");
      sLabel.className = "done-search-group-label";
      sLabel.textContent = "Backlog";
      section.appendChild(sLabel);
      backlogTasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "done-project-task";
        row.textContent = t.text;
        section.appendChild(row);
      });
      card.appendChild(section);
    }

    // Done tasks for this project
    if (projDone.length > 0) {
      const section = document.createElement("div");
      section.className = "done-project-section";
      const sLabel = document.createElement("div");
      sLabel.className = "done-search-group-label";
      sLabel.textContent = `Completed (${projDone.length})`;
      section.appendChild(sLabel);
      projDone.slice(0, 10).forEach((t) => {
        const doneIdx = state.done.indexOf(t);
        const row = document.createElement("div");
        row.className = "done-project-task done-project-task-completed";
        const hasDetail = (t.notes && t.notes.length > 0) || t.deadline;
        if (hasDetail) row.classList.add("has-detail");

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = true;
        cb.className = "done-project-task-cb";
        if (doneIdx >= 0) {
          cb.addEventListener("change", (e) => {
            e.stopPropagation();
            api("task/undone", { index: doneIdx });
            document.getElementById("done-search-input").value = "";
            doneSearchQuery = "";
          });
        }
        row.appendChild(cb);

        const textEl = document.createElement("span");
        textEl.textContent = t.text;
        row.appendChild(textEl);

        if (hasDetail) {
          const detail = document.createElement("div");
          detail.className = "done-task-detail";
          if (t.deadline) {
            const dlEl = document.createElement("div");
            dlEl.className = "done-task-detail-line";
            dlEl.textContent = "Due: " + t.deadline;
            detail.appendChild(dlEl);
          }
          (t.notes || []).forEach((note) => {
            const noteEl = document.createElement("div");
            noteEl.className = "done-task-detail-line";
            linkifyInto(noteEl, note);
            detail.appendChild(noteEl);
          });
          row.appendChild(detail);
          row.addEventListener("click", (e) => {
            if (e.target.tagName === "INPUT") return;
            row.classList.toggle("expanded");
          });
        }

        section.appendChild(row);
      });
      if (projDone.length > 10) {
        const more = document.createElement("div");
        more.className = "done-project-task";
        more.style.color = "#445";
        more.textContent = `+${projDone.length - 10} more`;
        section.appendChild(more);
      }
      card.appendChild(section);
    }

    el.appendChild(card);
  });

  // Show non-project task matches
  if (taskTextMatches.length > 0) {
    hasResults = true;
    const group = document.createElement("div");
    group.className = "done-search-group";
    const label = document.createElement("div");
    label.className = "done-search-group-label";
    label.textContent = "Other completed tasks";
    group.appendChild(label);
    taskTextMatches.slice(0, 15).forEach((task) => {
      group.appendChild(buildDoneRow(task));
    });
    if (taskTextMatches.length > 15) {
      const more = document.createElement("div");
      more.style.cssText = "font-size:11px;color:#445;padding:4px 12px;";
      more.textContent = `+${taskTextMatches.length - 15} more`;
      group.appendChild(more);
    }
    el.appendChild(group);
  }

  if (!hasResults) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:12px;color:#445;padding:12px;text-align:center;";
    empty.textContent = "No results";
    el.appendChild(empty);
  }
}

function buildDoneRow(task) {
  // Find the index in state.done for this task
  const doneIdx = state.done.indexOf(task);
  const hasDetail = (task.notes && task.notes.length > 0) || task.deadline;
  const wrapper = document.createElement("div");
  wrapper.className = "done-row-wrapper";
  if (hasDetail) wrapper.classList.add("has-detail");

  const div = document.createElement("div");
  div.className = "task";
  div.style.cursor = hasDetail ? "pointer" : "default";

  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = true;
  if (doneIdx >= 0) {
    cb.addEventListener("change", () => api("task/undone", { index: doneIdx }));
  }

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

  const del = document.createElement("button");
  del.className = "task-delete";
  del.textContent = "\u{1F5D1}";
  del.title = "Delete";
  if (doneIdx >= 0) {
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      api("task/delete", { section: "done", index: doneIdx });
    });
  }

  div.appendChild(cb);
  if (task.priority) {
    const pri = document.createElement("span");
    pri.className = "task-priority task-priority-" + task.priority;
    pri.style.opacity = "0.5";
    pri.textContent = task.priority === 2 ? "!!" : "!";
    div.appendChild(pri);
  }
  div.appendChild(text);
  if (task.project) div.appendChild(proj);
  div.appendChild(del);
  wrapper.appendChild(div);

  if (hasDetail) {
    const detail = document.createElement("div");
    detail.className = "done-task-detail";
    if (task.deadline) {
      const dlEl = document.createElement("div");
      dlEl.className = "done-task-detail-line";
      dlEl.textContent = "Due: " + task.deadline;
      detail.appendChild(dlEl);
    }
    (task.notes || []).forEach((note) => {
      const noteEl = document.createElement("div");
      noteEl.className = "done-task-detail-line";
      linkifyInto(noteEl, note);
      detail.appendChild(noteEl);
    });
    wrapper.appendChild(detail);
    div.addEventListener("click", () => wrapper.classList.toggle("expanded"));
  }

  return wrapper;
}

function isProjectActive(proj) {
  if (proj.archived) return false;
  if ((proj.tasks || []).length > 0) return true;
  // Check if any active/up_next tasks reference this project
  const hasRef = [...state.active, ...state.up_next].some((t) => t.project === proj.name);
  return hasRef;
}

function buildProjectCard(proj, collapsed) {
  const div = document.createElement("div");
  div.className = "project";
  div.dataset.name = proj.name;
  if (collapsed[proj.name] === undefined || collapsed[proj.name]) {
    div.classList.add("collapsed");
  }

  div.draggable = true;
  div.addEventListener("dragstart", (e) => {
    // Only start project drag from the header area, not from body inputs/editable
    if (e.target.closest(".project-body")) { e.preventDefault(); return; }
    projectDragName = proj.name;
    div.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  });
  div.addEventListener("dragend", () => {
    div.classList.remove("dragging");
    document.querySelectorAll(".project.drag-over-project").forEach((el) => el.classList.remove("drag-over-project"));
    projectDragName = null;
  });
  div.addEventListener("dragover", (e) => {
    if (!projectDragName || projectDragName === proj.name) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    document.querySelectorAll(".project.drag-over-project").forEach((el) => el.classList.remove("drag-over-project"));
    div.classList.add("drag-over-project");
  });
  div.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget || !div.contains(e.relatedTarget)) {
      div.classList.remove("drag-over-project");
    }
  });
  div.addEventListener("drop", (e) => {
    if (!projectDragName || projectDragName === proj.name) return;
    e.preventDefault();
    e.stopPropagation();
    div.classList.remove("drag-over-project");
    // Reorder: move dragged project before or after this one based on cursor position
    const rect = div.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const names = state.projects.filter(isProjectActive).map((p) => p.name);
    const fromIdx = names.indexOf(projectDragName);
    if (fromIdx === -1) return;
    names.splice(fromIdx, 1);
    let toIdx = names.indexOf(proj.name);
    if (after) toIdx++;
    names.splice(toIdx, 0, projectDragName);
    // Include inactive projects at the end to preserve full order
    const allNames = names.concat(state.projects.filter((p) => !isProjectActive(p)).map((p) => p.name));
    api("project/reorder", { order: allNames });
    projectDragName = null;
  });

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
  return div;
}

function renderProjects() {
  const el = document.getElementById("project-list");
  const prevVisible = new Set();
  const collapsed = {};
  el.querySelectorAll(".project").forEach((p) => {
    const name = p.dataset.name;
    if (name) {
      prevVisible.add(name);
      collapsed[name] = p.classList.contains("collapsed");
    }
  });
  el.innerHTML = "";

  const visible = state.projects.filter(isProjectActive);
  visible.forEach((proj) => {
    // New projects that just became active start expanded
    if (!prevVisible.has(proj.name)) {
      collapsed[proj.name] = false;
    }
    el.appendChild(buildProjectCard(proj, collapsed));
  });

  // If a project just appeared and the section is collapsed, open it
  const hasNew = visible.some((p) => !prevVisible.has(p.name));
  if (hasNew) {
    const section = document.getElementById("projects-section");
    section.classList.remove("collapsed");
    projectsExpandLevel = Math.max(projectsExpandLevel, 1);
  }

  // Sync expand level from actual DOM state
  syncProjectsExpandLevel();
}

function syncProjectsExpandLevel() {
  const section = document.getElementById("projects-section");
  if (section.classList.contains("collapsed")) {
    projectsExpandLevel = 0;
    return;
  }
  const cards = document.querySelectorAll("#project-list .project");
  if (cards.length === 0) {
    projectsExpandLevel = 1;
    return;
  }
  const allExpanded = Array.from(cards).every((p) => !p.classList.contains("collapsed"));
  projectsExpandLevel = allExpanded ? 2 : 1;
}

document.addEventListener("DOMContentLoaded", () => {
  // Collapsible section headers (History, Done)
  document.querySelectorAll(".collapsible-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.closest(".section").classList.toggle("collapsed");
    });
  });

  // Active / Up Next: 3-state cycle (hidden → tasks collapsed → tasks expanded → hidden)
  function setupTaskSectionCycle(headerId, sectionId, listId, stateKey) {
    document.getElementById(headerId).addEventListener("click", () => {
      const section = document.getElementById(sectionId);
      const wrappers = document.querySelectorAll(`#${listId} .task-wrapper`);
      const level = sectionExpandLevels[stateKey];

      if (level === 0) {
        section.classList.remove("collapsed");
        wrappers.forEach((w) => { w.classList.remove("expanded"); expandedTasks.delete(w.querySelector(".task")?.dataset.section + ":" + w.querySelector(".task")?.dataset.index); });
        sectionExpandLevels[stateKey] = 1;
      } else if (level === 1) {
        wrappers.forEach((w) => { w.classList.add("expanded"); expandedTasks.add(w.querySelector(".task")?.dataset.section + ":" + w.querySelector(".task")?.dataset.index); });
        sectionExpandLevels[stateKey] = 2;
      } else {
        section.classList.add("collapsed");
        sectionExpandLevels[stateKey] = 0;
      }
    });
  }
  setupTaskSectionCycle("active-header-toggle", "active-section", "active-list", "active");
  setupTaskSectionCycle("next-header-toggle", "next-section", "next-list", "up_next");

  // Projects header: 3-state cycle (collapsed → cards collapsed → cards expanded → collapsed)
  document.getElementById("projects-header-toggle").addEventListener("click", (e) => {
    if (e.target.closest(".add-project-toggle")) return;
    const section = document.getElementById("projects-section");
    const cards = document.querySelectorAll("#project-list .project");

    if (projectsExpandLevel === 0) {
      // Open section, all cards collapsed
      section.classList.remove("collapsed");
      cards.forEach((p) => p.classList.add("collapsed"));
      projectsExpandLevel = 1;
    } else if (projectsExpandLevel === 1) {
      // Expand all cards
      cards.forEach((p) => p.classList.remove("collapsed"));
      projectsExpandLevel = 2;
    } else {
      // Collapse entire section
      section.classList.add("collapsed");
      projectsExpandLevel = 0;
    }
  });

  // New project "+" button
  document.getElementById("add-project-toggle").addEventListener("click", (e) => {
    e.stopPropagation();
    const row = document.getElementById("add-project-inline");
    const input = document.getElementById("add-project-input");
    if (row.style.display === "none") {
      row.style.display = "block";
      input.focus();
    } else {
      row.style.display = "none";
      input.value = "";
    }
  });
  document.getElementById("add-project-input").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      const name = e.target.value.trim();
      if (name) {
        e.target.value = "";
        document.getElementById("add-project-inline").style.display = "none";
        api("project/add", { name });
      }
    } else if (e.key === "Escape") {
      e.target.value = "";
      document.getElementById("add-project-inline").style.display = "none";
    }
  });
  document.getElementById("add-project-input").addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Done section search
  document.getElementById("done-search-input").addEventListener("input", (e) => {
    doneSearchQuery = e.target.value;
    renderDone();
  });
  document.getElementById("done-search-input").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.target.value = "";
      doneSearchQuery = "";
      renderDone();
      e.target.blur();
    }
  });

  initChat();

  document.querySelectorAll(".task-list").forEach((list) => {
    list.addEventListener("dragover", onDragOver);
    list.addEventListener("dragleave", onDragLeave);
    list.addEventListener("drop", onDrop);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey && !e.target.closest("input, [contenteditable]")) {
      e.preventDefault();
      api("undo");
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey && !e.target.closest("input, [contenteditable]")) {
      e.preventDefault();
      api("redo");
    }
  });

  api("priorities");
});

// Chat panel
let chatSessionId = sessionStorage.getItem("locus_chat_session") || null;
let chatStreaming = false;

function initChat() {
  const panel = document.getElementById("chat-panel");
  const header = document.getElementById("chat-header");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const newBtn = document.getElementById("chat-new-btn");

  header.addEventListener("click", (e) => {
    if (e.target === newBtn) return;
    panel.classList.toggle("expanded");
    if (panel.classList.contains("expanded")) {
      chatEnsureReady();
    }
  });

  newBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    chatStartSession();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatSend();
    }
    if (e.key === "Escape") {
      panel.classList.remove("expanded");
    }
  });

  // Auto-resize textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 80) + "px";
  });

  sendBtn.addEventListener("click", chatSend);

  // Voice input via Web Speech API
  const micBtn = document.getElementById("chat-mic");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";
    let listening = false;

    micBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (listening) {
        recognition.stop();
      } else {
        finalTranscript = input.value;
        recognition.start();
      }
    });

    recognition.addEventListener("start", () => {
      listening = true;
      micBtn.classList.add("mic-active");
    });

    recognition.addEventListener("end", () => {
      listening = false;
      micBtn.classList.remove("mic-active");
      // Auto-send if there's content and user stopped recording
      if (input.value.trim()) {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 80) + "px";
      }
    });

    recognition.addEventListener("result", (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + e.results[i][0].transcript;
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      input.value = finalTranscript + (interim ? " " + interim : "");
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 80) + "px";
    });

    recognition.addEventListener("error", (e) => {
      listening = false;
      micBtn.classList.remove("mic-active");
      if (e.error !== "aborted") console.warn("Speech recognition error:", e.error);
    });
  } else {
    micBtn.style.display = "none";
  }

  // Check availability
  fetch("/api/chat/status")
    .then((r) => r.json())
    .then((d) => {
      if (!d.available) {
        chatShowSetup();
      }
    })
    .catch(() => {});
}

function chatEnsureReady() {
  const messages = document.getElementById("chat-messages");
  if (!chatSessionId || messages.children.length === 0) {
    if (chatSessionId) {
      chatRestoreSession(chatSessionId);
    } else {
      chatStartSession();
    }
  }
}

function chatRestoreSession(sessionId) {
  const messages = document.getElementById("chat-messages");
  messages.innerHTML = "";
  fetch(`/api/chat/history?session_id=${sessionId}`)
    .then((r) => r.json())
    .then((d) => {
      if (d.messages && d.messages.length > 0) {
        d.messages.forEach((msg) => chatAddMessage(msg.role, msg.content));
      } else {
        chatShowSuggestions();
      }
    })
    .catch(() => chatShowSuggestions());
}

function chatStartSession() {
  chatSessionId = crypto.randomUUID();
  sessionStorage.setItem("locus_chat_session", chatSessionId);
  const messages = document.getElementById("chat-messages");
  messages.innerHTML = "";

  chatShowSuggestions();
}

function chatShowSetup() {
  const messages = document.getElementById("chat-messages");
  messages.innerHTML = "";
  const div = document.createElement("div");
  div.className = "chat-setup";
  div.innerHTML =
    "To use chat, set up your API key and install the SDK:<br><br>" +
    "1. Set <code>ANTHROPIC_API_KEY</code> in <code>~/.zshrc</code><br>" +
    '2. Run <code>pip install anthropic</code> in the locus venv<br>' +
    "3. Restart the server";
  messages.appendChild(div);
}

function chatShowSuggestions() {
  const messages = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "chat-suggestions";

  const pills = [
    { text: "Add context about myself", message: "Here's some context about me: ", id: "ctx-pill" },
    { text: "What you know about me", action: "show-context" },
    { text: "What I want to do now", message: "Here's what I want to do right now: " },
    { text: "Discuss my priorities", message: "Here's what's on my plate right now, help me stack-rank these: " },
    { text: "Update project context", message: "I want to update project context: " },
    { text: "Add context about my project", message: "Here's some context about one of my projects: " },
  ];

  pills.forEach((pill) => {
    const btn = document.createElement("button");
    btn.className = "chat-suggestion";
    if (pill.id) btn.id = pill.id;
    btn.textContent = pill.text;
    btn.addEventListener("click", () => {
      if (pill.action === "show-context") {
        div.remove();
        chatShowStoredContext();
        return;
      }
      const input = document.getElementById("chat-input");
      input.value = pill.message;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      div.remove();
    });
    div.appendChild(btn);
  });
  messages.appendChild(div);

  // Highlight the context pill if user context is sparse
  fetch("/api/user-context")
    .then((r) => r.json())
    .then((d) => {
      const ctxPill = document.getElementById("ctx-pill");
      if (ctxPill && (!d.text || d.text.trim().length < 200)) {
        ctxPill.classList.add("chat-suggestion-recommended");
      }
    })
    .catch(() => {});
}

function chatShowStoredContext() {
  const input = document.getElementById("chat-input");
  input.value = "Give me a succinct but complete summary of everything you know about me -- my role, goals, projects, what I'm working on, and any other context you have.";
  chatSend();
}

function chatAddAction(text) {
  const messages = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "chat-action";
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function chatAddMessage(role, text) {
  const messages = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "chat-msg " + role;
  if (role === "assistant") {
    div.innerHTML = chatRenderMarkdown(text);
  } else {
    div.textContent = text;
  }
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function chatRenderMarkdown(text) {
  // Simple markdown: code blocks, inline code, bold, italic, lists
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  // List items (lines starting with - or *)
  html = html.replace(/^[\-\*] (.+)$/gm, "\u2022 $1");

  return html;
}

async function chatSend() {
  if (chatStreaming) return;
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  input.style.height = "auto";

  // Remove suggestions if present
  const suggestions = document.querySelector(".chat-suggestions");
  if (suggestions) suggestions.remove();

  chatAddMessage("user", message);

  if (!chatSessionId) {
    chatSessionId = crypto.randomUUID();
    sessionStorage.setItem("locus_chat_session", chatSessionId);
  }

  chatStreaming = true;
  document.getElementById("chat-send").disabled = true;
  document.getElementById("chat-status").textContent = "thinking...";

  const msgEl = chatAddMessage("assistant", "");
  let fullText = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: chatSessionId, message }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "delta") {
            fullText += data.text;
            msgEl.innerHTML = chatRenderMarkdown(fullText);
            document.getElementById("chat-messages").scrollTop =
              document.getElementById("chat-messages").scrollHeight;
          } else if (data.type === "action") {
            chatAddAction(data.result);
            api("priorities");
          } else if (data.type === "error") {
            fullText += "\n\nError: " + data.text;
            msgEl.innerHTML = chatRenderMarkdown(fullText);
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    if (!fullText) {
      msgEl.textContent = "Connection error. Is the server running?";
    }
  }

  chatStreaming = false;
  document.getElementById("chat-send").disabled = false;
  document.getElementById("chat-status").textContent = "";
}

// Drag and drop
let dragData = null;
let projectDragName = null;

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
