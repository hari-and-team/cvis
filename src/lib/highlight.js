export default function highlight(code) {
  if (!code) return "";
  let s = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ph = [];
  let pi = 0;
  const add = (html) => {
    ph.push(html);
    return `\x00${pi++}\x00`;
  };
  s = s.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, (m) => add(`<span style="color:#22c55e;font-style:italic">${m}</span>`));
  s = s.replace(/(#[^\n]*)/g, (m) => add(`<span style="color:#a78bfa">${m}</span>`));
  s = s.replace(/("(?:[^"\\]|\\.)*")/g, (m) => add(`<span style="color:#fde68a">${m}</span>`));
  s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => add(`<span style="color:#fb923c">${m}</span>`));
  s = s.replace(
    /\b(int|float|double|char|void|return|if|else|while|for|do|switch|case|break|continue|struct|typedef|sizeof|long|short|unsigned|signed|const|static|NULL)\b/g,
    (m) => add(`<span style="color:#f472b6;font-weight:600">${m}</span>`)
  );
  s = s.replace(
    /\b(printf|scanf|fprintf|putchar|puts|malloc|calloc|free|abs|sqrt|strlen|pow|rand|atoi|strcmp|strcpy|strcat)\b/g,
    (m) => add(`<span style="color:#38bdf8">${m}</span>`)
  );
  s = s.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, (m) => add(`<span style="color:#60a5fa">${m}</span>`));
  for (let i = 0; i < pi; i++) s = s.replace(`\x00${i}\x00`, ph[i]);
  return s + "\n";
}
