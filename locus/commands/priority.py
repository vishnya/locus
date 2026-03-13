"""lc priority add / lc project add -- manage projects and tasks."""

from locus.priorities import load, save, Project


def add(text: str, level: str = "", queue: bool = False, project: str | None = None):
    """Add a task to a project."""
    p = load()

    # Find target project
    proj = None
    if project:
        proj = p.get_project(project)
        if not proj:
            for pr in p.projects:
                if project.lower() in pr.name.lower():
                    proj = pr
                    break
    elif p.focus:
        proj = p.focused_project()

    if not proj:
        if p.projects:
            print(f"Specify a project with --project, or use `lc focus`. Projects: {', '.join(pr.name for pr in p.projects)}")
        else:
            print("No projects yet. Create one with: lc project add \"Project Name\"")
        return

    prefix = f"{level} " if level else ""
    proj.items.append(f"- [ ] {prefix}{text}")
    save(p)
    print(f"Added to {proj.name}: {prefix}{text}")


def add_project(name: str):
    """Add a new project."""
    p = load()
    if p.get_project(name):
        print(f"Project \"{name}\" already exists.")
        return
    p.projects.append(Project(name=name))
    save(p)
    print(f"Created project: {name}")
