/**
 * The content type editors keep select choices as comma-separated text in a
 * textarea; the API stores (and validates) them as a string array.
 */
export function optionsForSave(options: any): any {
  if (!options || typeof options !== 'object') return options;
  if (typeof options.choiceList === 'string' && options.choiceList) {
    // A shared choice list: the server copies its choices and labels in on save.
    const { choices: _c, choiceLabels: _l, ...rest } = options;
    return rest;
  }
  if (typeof options.choices !== 'string') return options;
  const choices = [...new Set(options.choices.split(',').map((c: string) => c.trim()).filter(Boolean))];
  return { ...options, choices };
}

/** Schema options from the API → editor state (choices as text). */
export function optionsForEditor(options: any): any {
  if (!options || typeof options !== 'object' || !Array.isArray(options.choices)) return options;
  return { ...options, choices: options.choices.join(', ') };
}
