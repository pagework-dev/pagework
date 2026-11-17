declare module "virtual:pagework-templates" {
  import type { Template } from "@pagework/templates";
  /** Built-in templates a script can use, resolved at build time. */
  const templates: Template[];
  export default templates;
}
