// Skill files are embedded with `with { type: "text" }` imports.
declare module "*.md" { const text: string; export default text }
declare module "*.palette" { const text: string; export default text }
declare module "*.stages" { const text: string; export default text }
declare module "*.grid" { const text: string; export default text }
declare module "*.txt" { const text: string; export default text }
