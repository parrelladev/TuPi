# M0 — baseline e regressão

Registro inicial do TuPi antes da refatoração. Capturado em 22/10/2026.

## Comandos e ambiente

- Node.js `v24.18.0`; npm disponível via `npm.cmd` neste ambiente Windows.
- `npm.cmd install`: concluído; `up to date`, auditoria sem vulnerabilidades reportadas.
- `npm.cmd run check`: passou (`node --check` em `server.js` e `public/app.js`).
- `npm.cmd test`: 3 testes passaram (HTTP + WebSocket real contra processo local).
- `npm.cmd start`: iniciou em `http://localhost:3000`.
- Branch prevista `feat/m0-baseline` não pôde ser criada: o ambiente permite leitura, mas não escrita no diretório `.git`. O trabalho ficou na branch `master`; nenhuma operação de branch ou commit foi feita.

## Baseline de frontend e dependências

| Item | Bytes |
|---|---:|
| `public/index.html` | 3.367 |
| `public/style.css` | 4.514 |
| `public/app.js` | 11.293 |
| **Total estático** | **19.174** |

- Dependência declarada de runtime: `ws ^8.18.0` (instalada: `ws@8.22.0`).
- Dependências de frontend/build: nenhuma.
- `package-lock.json` preservado; `npm install` não alterou o lockfile.

## Fluxo atual observado no código e no teste de integração

1. Home oferece apenas “Criar sala”. O servidor `POST /api/rooms` cria ID hexadecimal aleatório de 32 caracteres (128 bits).
2. A sala abre pela URL `?room=<id>`. Na entrada, o cliente abre `/signal` e envia `join`.
3. O primeiro peer recebe papel `host`; o segundo recebe `guest`, e o primeiro recebe `peer-joined`.
4. O segundo peer provoca a oferta WebRTC. `offer`, `answer` e candidatos `ice` passam pelo servidor para o outro peer.
5. O cliente cria transceivers send/receive para áudio e vídeo, e um RTCDataChannel ordenado para chat.
6. Microfone e compartilhamento de tela são opcionais e ativados por controles separados. O vídeo usa um único sender.
7. Fechar a conexão de um peer envia `peer-left` ao participante restante. A sala é removida quando o último peer sai.
8. Um terceiro peer recebe erro de sala cheia; ID inválido e sala inexistente também são recusados.

### Limitações de baseline confirmadas

- Não foi possível verificar no navegador duas abas, negociação ICE/WebRTC, áudio, permissão de microfone/tela e chat em canal de dados: não havia navegador disponível para automação nesta sessão. Esses fluxos permanecem no checklist manual abaixo.
- Câmera independente não existe; câmera e tela compartilham um só `videoSender`.
- Se dois participantes transmitirem tela, a UI atual escolhe uma fonte em `renderScreen()` em vez de apresentar ambas.
- Há somente STUN público de exemplo, sem TURN configurado. Redes restritivas podem falhar.
- Não há reconexão automática; salas recém-criadas sem participantes não têm TTL.

## Checklist manual de regressão

Usar duas abas em `http://localhost:3000`; para áudio no mesmo computador, usar fones.

- [x] Microfone capturado e áudio recebido pelo outro participante (confirmado pelo usuário em teste real entre dois pontos).
- [x] Compartilhamento de tela recebido pelo outro participante (confirmado pelo usuário em teste real entre dois pontos).
- [x] Chat funcional (confirmado pelo usuário).
- [x] Sair da sala e reentrar (confirmado pelo usuário).
- [x] Comportamento ao negar permissões reproduzido: antes do ajuste, o compartilhamento de tela descartava silenciosamente `NotAllowedError`; o usuário também relatou ausência de feedback ao negar captura. O código agora mostra orientação e deixa o estado de permissão visível na sala. Reteste após a correção ainda pendente.

Não será feito teste manual de terceiro participante: o cenário de produto é estritamente um para um. O limite máximo de dois peers permanece coberto pelo teste de integração automatizado do servidor.

## Testes automatizados adicionados

`tests/server.test.js` inicia o entrypoint do servidor em porta local aleatória e cobre:

- criação e formato/aleatoriedade do ID;
- ID inválido e sala inexistente;
- admissão de dois peers e recusa do terceiro;
- evento `peer-left` após uma saída;
- limpeza da sala após saída do último peer.

Não valida SDP/ICE real, mídia do navegador, chat sobre RTCDataChannel ou uso entre redes distintas.
