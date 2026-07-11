import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap } from "https://esm.sh/@codemirror/view@^6.0.0";
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "https://esm.sh/@codemirror/language@^6.0.0";
import { history, defaultKeymap, historyKeymap } from "https://esm.sh/@codemirror/commands@^6.0.0";
import { highlightSelectionMatches } from "https://esm.sh/@codemirror/search@^6.0.0";
import { closeBrackets, closeBracketsKeymap } from "https://esm.sh/@codemirror/autocomplete@^6.0.0";
import { sql } from "https://esm.sh/@codemirror/lang-sql@^6.0.0";

const cmTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--code-bg)",
    color: "var(--text)",
    borderRadius: "8px",
    border: "1px solid var(--border)",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "var(--accent)",
  },
  ".cm-scroller": {
    fontFamily: "var(--mono)",
    fontSize: "14px",
    lineHeight: "1.5",
    minHeight: "160px",
  },
  ".cm-content": {
    padding: "12px",
    caretColor: "var(--accent)",
  },
  ".cm-gutters": {
    borderRight: "none",
    backgroundColor: "transparent",
    color: "var(--muted)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent)",
  },
  ".cm-selectionBackground, .cm-selectionBackground::selection": {
    backgroundColor: "var(--accent-soft)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--surface-2)",
  },
  ".cm-line": {
    padding: "0",
  },
});

const sqlSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  rectangularSelection(),
  crosshairCursor(),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
];

function initCodeMirror() {
  document.querySelectorAll('[data-widget="sql"] textarea').forEach(ta => {
    const body = ta.closest('.widget-body');
    const runBtn = body && body.querySelector('.run-btn');

    const wrapper = document.createElement('div');
    ta.parentNode.insertBefore(wrapper, ta);

    const view = new EditorView({
      doc: ta.value,
      extensions: [sqlSetup, sql(), cmTheme],
      parent: wrapper,
    });

    ta.style.display = 'none';

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        ta.value = view.state.doc.toString();
      }, { capture: true });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initCodeMirror, 0));
} else {
  setTimeout(initCodeMirror, 0);
}
