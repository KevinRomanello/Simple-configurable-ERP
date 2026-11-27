// The fields of the working site (the box a grid opens on a cell, the searches, the forms of Settings) hold names, phones and
// codes of the team, and are never a form for a password manager to fill in: Bitwarden, LastPass, 1Password and Proton Pass
// offer to «fill an identity» there because the text near a field looks like one. `autocomplete="off"` is not enough (Bitwarden
// does not obey it): each of them has an attribute of its own that says «leave this field alone».
//
// The public forms of the registry (`/forms/…`) are not part of the working site and do not use this: there somebody applying
// is helped by a password manager that fills in the name, the email and the phone.

const IGNORE = { "data-bwignore": "true", "data-lpignore": "true", "data-1p-ignore": "true", "data-protonpass-ignore": "true" };

/**
 * The fields a person writes or chooses in: not the boxes to tick, the files or the buttons. A choice (`select`) counts too: a list
 * called «State» looks to Bitwarden like the state of an address.
 */
const TEXT_FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select';

function tag(field: Element) {
  for (const [name, value] of Object.entries(IGNORE)) if (field.getAttribute(name) !== value) field.setAttribute(name, value);
  if (!field.hasAttribute("autocomplete")) field.setAttribute("autocomplete", "off");
}

/** Marks the text fields of `node` (it, or what is inside it). */
function tagWithin(node: Node) {
  if (!(node instanceof Element)) return;
  if (node.matches(TEXT_FIELDS)) tag(node);
  node.querySelectorAll(TEXT_FIELDS).forEach(tag);
}

/**
 * Marks the text fields of the page now and every one that appears later (a grid draws its cell editors when they are clicked, a
 * record opens over the page), at the moment it appears: before the next drawing, which is when a password manager looks at it. Returns
 * what stops it.
 */
export function ignorePasswordManagers(root: Element = document.body): () => void {
  tagWithin(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(tagWithin);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
