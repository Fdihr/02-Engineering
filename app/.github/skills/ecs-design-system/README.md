# ecs-design-system (GitHub Copilot agent skill)

Makes any web app look 1:1 like the ECS Security Principles / CAPE app: Vestas Sans, Night Sky top
bar, Blue Sky accent, light/dark theme, rules-not-boxes layout, command palette and administration
area. Based on the `DESIGN.md` from the `gufbi-ai-dev` branch (see `references/design-principles.md`). Works with the GitHub Copilot
app, Copilot CLI, Copilot cloud agent and agent mode in VS Code, Visual Studio and JetBrains IDEs.

## Install

With GitHub CLI 2.90 or later:

```sh
# into the current repo (.agents/skills/) – shared with the whole team via git
gh skill install vestas/ecs-security-principles ecs-design-system --allow-hidden-dirs

# or for yourself in every project (~/.copilot/skills/)
gh skill install vestas/ecs-security-principles ecs-design-system --allow-hidden-dirs --scope user
```

Manual alternative: copy this folder to `.github/skills/ecs-design-system/` in your repo, or to
`~/.copilot/skills/ecs-design-system/`.

Update later with `gh skill update ecs-design-system`.

## Use

Ask Copilot, for example:

- "Use the ecs-design-system skill to style my app"
- "Build an admin settings page in the ECS design"
- "Make a new React app that looks like ECS Security Principles"

In the CLI or the Copilot app you can also invoke it directly with `/ecs-design-system`.
Check that it is loaded with `/skills list`.

## What's inside

- `SKILL.md` – workflow and hard rules Copilot follows
- `references/` – full design principles, component API, layout/admin recipes, review checklist
- `template/` – type-checked Vite + React + Tailwind v4 starter with every component and example pages
- `scripts/install.ps1` / `install.sh` – copy the system into an existing project

The Vestas Sans font files in `template/src/assets/vestas/` are licensed for Vestas internal use only.
