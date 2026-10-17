import { useEffect, useState, type ReactNode } from 'react';
import { SUPPORT_URL, TOOLS, type Tool } from './tools';
import { Downloader } from './tools/downloader/Downloader';
import { Editor } from './tools/editor/Editor';

/* The built-in tools, by id. A tool with kind 'app' needs an entry here. */
const SCREENS: Record<string, () => ReactNode> = {
  downloader: () => <Downloader />,
  editor: () => <Editor />
};

const openTools = TOOLS.filter((t) => t.kind !== 'soon');

function fromHash(): string {
  const id = window.location.hash.slice(1);
  return openTools.some((t) => t.id === id) ? id : openTools[0].id;
}

export function App() {
  const [active, setActive] = useState(fromHash);
  /* Tools stay mounted once opened, so switching tabs never loses an edit
     or a download in progress. */
  const [visited, setVisited] = useState<string[]>(() => [fromHash()]);

  useEffect(() => {
    const onHash = () => setActive(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setVisited((v) => (v.includes(active) ? v : [...v, active]));
    const tool = TOOLS.find((t) => t.id === active);
    document.title = tool ? `${tool.name} · CountriesIRL Studio` : 'CountriesIRL Studio';
  }, [active]);

  return (
    <div className="studio">
      <header className="bar">
        <a className="bar__brand" href={`#${openTools[0].id}`}>
          <img src="/logo.png" alt="CountriesIRL" width={30} height={30} />
          <span className="bar__studio">Studio</span>
        </a>
        <nav className="tabs" aria-label="Tools">
          {TOOLS.map((tool) => (
            <TabLink key={tool.id} tool={tool} active={tool.id === active} />
          ))}
        </nav>
        <div className="bar__end">
          {SUPPORT_URL && (
            <a className="support-link" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
              </svg>
              Support us
            </a>
          )}
          <a className="bar__terms" href="/terms.html">Terms</a>
        </div>
      </header>

      <main className="stage">
        {TOOLS.filter((t) => visited.includes(t.id)).map((tool) => (
          <section key={tool.id} className="screen" hidden={tool.id !== active} aria-label={tool.name}>
            {tool.kind === 'embed' && tool.url ? (
              <iframe className="embed" src={tool.url} title={tool.name} allow="clipboard-write; fullscreen" />
            ) : (
              SCREENS[tool.id]?.() ?? <p className="empty">This tool has no screen yet.</p>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}

function TabLink({ tool, active }: { tool: Tool; active: boolean }) {
  const soon = tool.kind === 'soon';
  const body = (
    <>
      <span className="tab__name">
        {tool.name}
        {soon && <span className="tab__soon">Soon</span>}
      </span>
      <span className="tab__blurb">{tool.blurb}</span>
    </>
  );
  if (soon) {
    return (
      <span className="tab is-soon" aria-disabled="true" title={`${tool.name} is on its way`}>
        {body}
      </span>
    );
  }
  return (
    <a className="tab" href={`#${tool.id}`} aria-current={active ? 'page' : undefined}>
      {body}
    </a>
  );
}
