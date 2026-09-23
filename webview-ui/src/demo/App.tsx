// Per-component imports keep unused web components out of the bundle.
import VscodeButton from '@vscode-elements/react-elements/dist/components/VscodeButton.js';
import VscodeTextfield from '@vscode-elements/react-elements/dist/components/VscodeTextfield.js';
import { useEffect, useState } from 'react';
import { onMessage, postMessage } from '../vscodeApi';

export function App() {
  const [version, setVersion] = useState<string>();
  const [name, setName] = useState('');
  const [reply, setReply] = useState<string>();

  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case 'init':
          setVersion(message.extensionVersion);
          break;
        case 'helloReply':
          setReply(message.text);
          break;
      }
    });
    postMessage({ type: 'ready' });
    return unsubscribe;
  }, []);

  return (
    <main className="demo">
      <p>Dimicek webview is running{version ? ` (v${version})` : ''}.</p>
      <form
        className="demo__form"
        onSubmit={(event) => {
          event.preventDefault();
          postMessage({ type: 'sayHello', name });
        }}
      >
        <VscodeTextfield
          placeholder="Your name"
          value={name}
          onInput={(event) => setName((event.target as HTMLInputElement).value)}
        />
        <VscodeButton type="submit">Say hello</VscodeButton>
      </form>
      {reply && <p className="demo__reply">{reply}</p>}
    </main>
  );
}
