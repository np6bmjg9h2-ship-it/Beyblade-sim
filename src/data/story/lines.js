// Dialogue line helper shared by the chapter files: [speaker, text, cond?].
export const L = (speaker, text, cond) => (cond ? [speaker, text, cond] : [speaker, text]);
