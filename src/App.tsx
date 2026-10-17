import { useEffect, useState, type ReactNode } from 'react';
import { TOOLS, type Tool } from './tools';
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
          <img src="/logo.png" alt="" width={26} height={26} />
          <span className="bar__name">CountriesIRL</span>
          <span className="bar__studio">Studio</span>
        </a>
        <nav className="tabs" aria-label="Tools">
          {TOOLS.map((tool) => (
            <TabLink key={tool.id} tool={tool} active={tool.id === active} />
          ))}
        </nav>
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
