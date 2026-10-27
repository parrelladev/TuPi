# TuPi — comunicação P2P no navegador

Lobby minimalista para **2 pessoas** com voz, câmera, compartilhamento de tela, chat de texto, arquivos e YouTube em conjunto.

Não há salas, códigos nem convites: existe um **lobby único e aberto**. Ao abrir o TuPi, cada pessoa vê uma tela de pré-entrada (prévia da câmera, microfone, câmera, seletores de dispositivo, avatar e nome) e escolhe **Participar agora**. Quando as duas pessoas estão online no lobby, a chamada começa sozinha; com o lobby cheio, quem chega espera e entra assim que abrir uma vaga. Cada pessoa escolhe um avatar entre 30 ícones de animais (`public/assets/avatars`) e um nome; o nome padrão é o do avatar, pode ser trocado no lobby e durante a chamada, e é mostrado para a outra pessoa. Microfone, câmera e captura de tela só são ativados quando cada pessoa escolhe os controles. Em “Dispositivos e áudio”, cada participante pode selecionar microfone/câmera e alternar entre processamento padrão (redução de eco/ruído e ganho automático, se suportados) e áudio natural. O visual usa a identidade TuPi e se adapta a telas grandes e celulares, com tema claro, escuro ou automático.

## Requisitos
- Node.js 20+
- Chrome, Edge ou Firefox recente

## Rodar localmente

```bash
npm install
npm start
```

Configurações locais ficam em `.env` (ignorado pelo Git). Copie `.env.example` para `.env`; `IPV6=` só afeta a mensagem de inicialização.

O foco do TuPi é o uso em computadores domésticos. Não há serviço TURN incluído nem exigência de contratá-lo: a configuração permanece opcional para quem precisar de relay. Mesmo redes domésticas podem ter NAT restritivo ou CGNAT; nesses casos, a conexão direta pode falhar e TURN pode ser necessário.

Para configurar STUN/TURN opcionalmente, defina `ICE_SERVERS` como array JSON, por exemplo `[{"urls":["stun:stun.seudominio:3478"]}]`, ou use `STUN_URL`, `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`. Sem TURN, deixe suas variáveis vazias. Não salve credenciais permanentes em um repositório. Valores TURN enviados ao navegador são visíveis aos participantes; prefira credenciais temporárias emitidas pelo serviço TURN.

Abra **http://localhost:3000** em duas abas do mesmo computador e clique em **Participar agora** em cada uma: a chamada começa quando as duas estiverem online. Ative microfone, câmera e/ou tela independentemente pelos controles. Use fones para evitar microfonia ao testar no mesmo dispositivo.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Teste com computadores diferentes

`localhost` é considerado contexto seguro pelos navegadores. Para outro dispositivo na rede, o acesso por `http://IP-DA-MAQUINA:3000` **não** é contexto seguro e pode bloquear `getUserMedia` e `getDisplayMedia`. Publique o site **sob HTTPS** e use **WSS** para sinalização. Opcionalmente, configure `HOST=127.0.0.1` atrás de proxy reverso TLS (Caddy/Nginx) que encaminhe HTTP e WebSocket; o proxy não é necessário para teste local. Se o proxy sobrescrever `X-Forwarded-For` com o IP real do cliente, defina `TRUST_PROXY=1`; deixe desligado para acesso direto.

Exemplo de inicialização em rede (ainda exige proxy HTTPS para mídia noutros dispositivos):

```bash
HOST=127.0.0.1 PORT=3000 npm start
```

## Como funciona
- Existe um único lobby, com no máximo 2 pessoas. Não há rotas de criação ou consulta de salas (`/api/rooms` deixou de existir).
- `GET /api/config` entrega a configuração pública de ICE; credenciais TURN disponibilizadas ao browser podem ser inspecionadas pelos participantes.
- `ws(s)://.../signal` aceita `{ type: "join" }`. O servidor responde `joined` com `role` (`host` para quem chegou primeiro, `guest` para o segundo), avisa o primeiro com `peer-joined` e envia `lobby` com a quantidade de pessoas a quem está no lobby. Com 2 pessoas, quem tentar entrar recebe `error` com `code: "full"` (o cliente tenta de novo a cada 4 s). Só quem está no lobby recebe ou envia SDP/ICE, que o servidor valida antes de encaminhar.
- `RTCPeerConnection` transporta microfone, câmera e tela por faixas de envio independentes; cada navegador controla suas fontes sem ligar dispositivos automaticamente.
- `RTCDataChannel` transporta texto diretamente entre os navegadores.
- O aviso sonoro de novas mensagens vem ativado e toca para cada mensagem recebida; o botão **Som** permite silenciá-lo, e a preferência fica salva neste navegador. O áudio só começa após uma interação do usuário, conforme as regras do navegador. Mensagens recebidas com o chat fechado ou a aba em segundo plano acendem uma bolinha no botão **Chat** até o painel ser aberto.
- Um canal `RTCDataChannel` separado transporta arquivos diretamente entre os navegadores. O recebimento pede consentimento, valida os blocos com SHA-256 encadeado e permite cancelar a transferência.
- YouTube Watch Together usa um terceiro canal P2P para sincronizar o vídeo incorporado em cada navegador; o servidor TuPi não recebe nem retransmite vídeo. Abrir ou fechar o YouTube é um evento compartilhado: o botão acende nos dois lados, o painel abre e fecha para as duas pessoas e pode permanecer ativo junto com o quadro branco e o compartilhamento de tela.
- O estado do lobby e as mensagens ficam somente em memória; quando uma pessoa sai, a outra recebe `peer-left` e volta a aguardar no lobby (com 5 s de tolerância para a pessoa voltar, por exemplo ao usar **Reconectar**).
- O servidor limita conexões por endereço e mensagens de sinalização; os limites em processo único reduzem abuso básico, mas não substituem proteção distribuída.
- Cabeçalhos CSP e de segurança restringem scripts e embeds ao TuPi e ao player do YouTube. O serviço não registra conteúdo de chat, arquivos, SDP ou mídia.

## Qualidade e diagnóstico

Ao clicar em **Compartilhar**, a pessoa escolhe o perfil de tela (480p a 1440p, tentativa Ultra 4K60 ou resolução nativa), FPS (30 a 144), bitrate máximo desejado e foco automático/jogo/vídeo; o botão para iniciar a captura fica no rodapé desse menu. A câmera continua com o perfil padrão de captura e pode ser ligada/desligada e ter o dispositivo selecionado em **Mais**. Os valores de tela são solicitações; navegador, dispositivo, capturador e rede podem aplicar valores menores. O painel mostra configurações efetivas da captura, codecs divulgados pelo navegador, bitrate/FPS medidos, RTT, jitter, perda, estado ICE e indicação de relay TURN quando identificável. Durante o compartilhamento, a resolução e o FPS efetivos ficam no indicador da tela. Um ajuste adaptativo conservador reduz o teto de envio após congestionamento persistente e o recupera gradualmente quando a rede estabiliza.

A lista de codecs usa as capacidades anunciadas pelo navegador. A Web API não oferece uma forma interoperável de confirmar que o encoder de hardware está ativo; a aplicação não promete aceleração por GPU nem captura/encode de 4K60.

## Transferência de arquivos

Na chamada, escolha um arquivo em **Transferir arquivo**. A outra pessoa precisa aceitar o recebimento; a transferência começa somente depois do consentimento. Chrome e Edge (`showSaveFilePicker`) gravam os blocos direto no destino escolhido. Firefox e Safari usam o **Service Worker** (`public/sw.js`): ele entrega os blocos ao gerenciador de downloads do navegador, também sem manter o arquivo na memória. Só se o Service Worker não estiver disponível (ex.: janela privada do Firefox, HTTP fora de localhost) o arquivo é montado em memória até 1 GiB, em Blobs de 32 MiB; acima disso o recebimento é recusado.

Há dois protocolos, escolhidos ao lado do botão **Escolher arquivo** (Automático, Rápido ou Compatível): o **compatível (v2)** envia blocos de 64 KiB, um por vez, cada um confirmado; o **rápido (v3)** usa blocos de 128 KiB com janela de 16 blocos em voo e confirmação cumulativa. No Automático, o rápido é usado a partir de 4 MiB, e o painel mostra a recomendação para cada arquivo. Se a outra pessoa tiver uma versão antiga, o envio rápido é refeito sozinho no modo compatível. A velocidade aparece no status. O canal tem controle de fluxo pelo buffer do DataChannel e pausa quando o ajuste adaptativo de qualidade detecta congestionamento. Cada bloco tem hash SHA-256 conferido antes de ser gravado; a transferência também valida a ordem, a quantidade de blocos e o tamanho total antes de concluir. O limite máximo de oferta é 20 GiB; limites reais podem ser menores por navegador ou espaço em disco. A transferência usa WebRTC P2P (ou TURN quando necessário), não passa pelo servidor TuPi. Só há uma transferência ativa por chamada; sair do lobby ou desconectar cancela e limpa o estado.

### YouTube Watch Together

Na chamada, abra **YouTube**, cole um link ou ID de vídeo (o campo já vem com um vídeo padrão) e selecione **Abrir vídeo**. Cada pessoa recebe o mesmo vídeo e o reproduz do YouTube no próprio navegador. Reproduzir, pausar e buscar posição são enviados pelo canal de controle P2P; quem já estava no lobby envia snapshots periódicos para corrigir divergências. A tolerância de sincronização pode ser ajustada na interface. O player incorporado depende de disponibilidade do vídeo, permissão de incorporação, conexão com o YouTube e suporte/autoplay do navegador. Quando o autoplay estiver bloqueado, cada pessoa deve pressionar Reproduzir. Anúncios e buffering são controlados pelo YouTube e podem causar diferenças temporárias. O TuPi não baixa nem redistribui o vídeo.

## Segurança, troubleshooting e limitações
- Sem STUN/TURN configurado, a conexão pode falhar em redes com NAT restritivo. Configure ICE no `.env`; TURN consome banda e as credenciais entregues ao navegador podem ser inspecionadas.
- **Não é E2EE com verificação de identidade:** WebRTC cifra mídia e dados em trânsito (DTLS/SRTP), mas um servidor de sinalização não confiável pode realizar ataques de intermediação. Para maior proteção, implemente autenticação de pares e verificação de identidade.
- O lobby é aberto a qualquer pessoa que conheça o endereço do servidor: não há credencial de acesso. Com 2 pessoas já conectadas, as demais esperam. Se for expor o TuPi publicamente e isso for um problema, coloque autenticação no proxy reverso.
- Lobby e limites de requisição ficam em memória do processo. Rate limiting reduz abuso básico, mas não substitui proxy/WAF ou proteção distribuída em implantação pública.
- O tema (automático, claro ou escuro) é trocado pela entrada **Tema** do menu **Mais** na chamada ou pelo botão no canto do lobby; a escolha fica salva neste navegador. O volume do YouTube tem um controle compartilhado (vale para as duas pessoas) e um individual (só para você). A chamada sempre cabe na janela, sem rolagem da página.
- O botão **Reconectar** (ícone de setas circulares, ao lado do status no cabeçalho da chamada) refaz a sinalização e a conexão P2P sem sair do lobby; fica vermelho quando a conexão está ruim.
- A sinalização tenta reconectar com backoff limitado; o peer iniciador pode tentar ICE restart. Isso não garante recuperação em todas as redes; TURN pode ser necessário.
- O TuPi não transmite áudio da aba/sistema durante compartilhamento de tela; apenas áudio do microfone. Áudio da captura de tela ainda não está implementado.
- O navegador controla quais telas podem ser capturadas e pode bloquear autoplay até interação do usuário.
- A CSP permite o player incorporado do YouTube. Outros domínios de mídia externos não estão autorizados.

### Proxy reverso TLS (opcional)

Configure Caddy ou Nginx para terminar TLS e encaminhar `Host`, `X-Forwarded-For` e conexões WebSocket para o TuPi em `127.0.0.1:3000`. O proxy precisa permitir o upgrade WebSocket em `/signal`. O TuPi não habilita TLS diretamente e não exige proxy para `localhost`.

## Checagem e testes

```bash
npm run check
npm test
```

Os testes automatizados cobrem os cabeçalhos, o lobby único (limite de dois, contagem de pessoas, saída e reentrada) e o encaminhamento de sinalização. A validação de câmera, microfone, compartilhamento de tela, navegador móvel, ICE/TURN e redes diferentes ainda exige teste manual.

O [relatório do M10](M10_RELATORIO.md) registra os nove testes do servidor, o teste
local com dois peers no navegador, o inventário de assets e as lacunas de redes e
desempenho. Para repetir o inventário sem instalar ferramentas adicionais:

```bash
node scripts/m10-assets.js
```

O relatório também descreve a coleta opcional de CPU/RSS do servidor em Linux e o
roteiro ainda pendente de TURN, redes diferentes e carga de mídia prolongada.

## Organização

```
TuPi/
├── package.json
├── server.js          # HTTP + WebSocket para sinalização
├── server/
│   └── whiteboard.js  # permissões, operações e persistência do quadro
├── public/
│   ├── assets/        # marca vetorial local
│   ├── css/whiteboard.css # estilos exclusivos do quadro
│   ├── js/            # UI, sinalização, WebRTC, mídia e chat
│   │   └── features/whiteboard/ # index, view, renderer e export
│   ├── index.html     # interface
│   ├── style.css      # estilos responsivos
│   └── app.js         # inicialização e ciclo de vida
├── tests/
│   ├── whiteboard.test.js # testes do backend
│   └── browser/whiteboard.cjs # integração em duas sessões
└── README.md
```

## Ícones

A interface usa [Phosphor Icons](https://phosphoricons.com/) (licença MIT), empacotados em `public/vendor/phosphor` sem CDN, porque a CSP só permite recursos do próprio site. Para usar um ícone novo, escreva `<i class="ph ph-nome"></i>` (ou `ph-fill` para a versão preenchida) e rode `npm run vendor` para regenerar o CSS com os ícones usados.

## Atalhos e avisos

- Teclado: `M` microfone, `V` câmera, `C` chat, `F` tela cheia. A lista fica em **Mais > Atalhos**.
- Links no chat viram links clicáveis (seta animada); antes de abrir, um popup pede confirmação e mostra o domínio.
- Com a aba em segundo plano, o TuPi pisca o título e (se permitido) notifica quando a outra pessoa chega, chega uma mensagem ou um pedido de arquivo; o chat abre sozinho ao receber mensagem ou arquivo.
- Ao compartilhar a tela, marque **Compartilhar áudio da tela** (Chrome e Edge) para enviar o som; quem assiste e quem compartilha têm um botão de mudo. Em **Mais > Dispositivos e áudio** dá para escolher o alto-falante.

## App instalável e offline (PWA)

- `public/sw.js` guarda o app em cache (rede primeiro, cache como reserva): a tela do lobby abre mesmo sem internet, mas a chamada continua exigindo rede.
- `manifest.webmanifest` permite instalar o TuPi (**Mais > Instalar o TuPi**, quando o navegador oferecer) com ícone próprio.
- Service Workers exigem HTTPS ou `localhost`. Ao incluir um arquivo novo no app, acrescente-o a `PRECACHE` em `sw.js` (o teste do servidor confere que todos existem) e, em mudanças grandes, troque `CACHE`.

## Conexão, chat e encerramento

- **Qualidade da conexão:** o ícone de barras no cabeçalho mostra de "Ruim" a "Ótima" (latência, perda e jitter). Ao clicar, abre a rota usada (**Direta P2P** ou **Relé TURN**) e dicas. Se a rota for relé, arquivos e vídeo tendem a ficar mais lentos.
- **Reconexão automática:** se a conexão P2P não se recuperar sozinha em 12 s, o TuPi tenta de novo até 3 vezes (3 s, 6 s e 12 s), com contagem regressiva no status. O botão de recarregar continua disponível.
- **Chat:** `Enter` envia e `Shift+Enter` quebra a linha; o campo cresce até 5 linhas.
- **Chamada encerrada:** ao sair (ou quando a outra pessoa sai) aparece uma tela com a duração, o número de mensagens e o botão **Copiar conversa**; **Voltar ao lobby** volta para a tela inicial.
- **Cloudflare Tunnel:** ele só carrega a página e a sinalização (WebSocket). O áudio, o vídeo e os arquivos vão direto entre os navegadores (ou pelo TURN, se configurado), então o túnel não limita a velocidade; o indicador acima mostra se a rota é direta ou por relé.

### Sem som ao compartilhar a tela?

O selo sobre a tela mostra **com áudio** ou **sem áudio** (nos dois lados). Se mostrar "sem áudio" em quem compartilha, o navegador não entregou o som:
- Só **Chrome e Edge** capturam áudio da tela; Firefox e Safari não.
- Na janela de seleção do navegador, escolha **uma aba** (marque "Compartilhar áudio da guia") ou **a tela inteira** (marque "Compartilhar áudio do sistema"). Compartilhar uma **janela** não inclui áudio.
- Se mostrar "com áudio" em quem compartilha e quem assiste não ouve, veja o botão de som no canto da tela compartilhada (pode estar mudo) e o alto-falante escolhido em **Mais > Dispositivos e áudio**.

## Quadro Branco colaborativo

Na conversa, escolha **Quadro Branco** no seletor ao lado de **Compartilhar tela** e **YouTube**. O quadro ocupa um painel independente no palco. YouTube e tela compartilhada podem permanecer abertos ao mesmo tempo; cada botão destaca seu próprio estado ativo. Não há acesso pelo lobby nem janela flutuante. Cada pessoa escolhe seu modo de visualização; o conteúdo do quadro é compartilhado. O quadro funciona sem câmera, microfone ou conexão WebRTC, usando o WebSocket existente.

Ferramentas: seleção, movimento e redimensionamento pela alça; texto (duplo clique para editar), lápis, linha, seta, retângulo, círculo, notas coloridas, carimbos, laser temporário, borracha, exclusão, limpeza confirmada, histórico individual, zoom e ajuste à tela. As ferramentas ficam na lateral; a barra de propriedades mostra apenas as opções relevantes para a ferramenta ou seleção. Em janelas de menor altura, a lateral usa duas colunas. Desfazer/refazer ficam no cabeçalho, navegação no canto inferior, e exportação, autoria, permissões e limpeza no menu do quadro. O botão de teclado abre **Atalhos do quadro**, usando o mesmo visual dos atalhos globais, em uma lista separada. As opções de estilo podem ser aplicadas ao selecionado. Arraste com a ferramenta Mover ou Espaço; use a roda para zoom. Com foco na área de desenho, V/P/T escolhem seleção/lápis/texto; Delete exclui; Ctrl/Cmd Z desfaz; Ctrl/Cmd Shift Z refaz. Atalhos ficam suspensos nos campos de digitação. Cursores desaparecem após inatividade; autoria pode ser exibida pelo controle Autoria.

O anfitrião pode alternar o outro participante entre edição e visualização e limpar o quadro. Se sair, o participante restante assume a administração. Permissões são validadas no servidor, inclusive para mensagens WebSocket enviadas diretamente. Cada elemento tem versão: duas gravações concorrentes no mesmo elemento não se sobrescrevem silenciosamente; a segunda recebe um aviso para conferir e tentar novamente. Desfazer/refazer também exige a versão esperada, preservando alterações de outras pessoas. O histórico fica na sessão do navegador; o conteúdo editável fica no servidor.

O salvamento automático usa `data/whiteboard.json`, fora da pasta pública, com gravação temporária e substituição do arquivo antes da confirmação. Configure `BOARD_DATA_DIR` para um diretório persistente e gravável em produção e faça backup dele. Execute **uma instância do servidor por diretório**; não há coordenação entre múltiplos processos. Erros de disco são apresentados e não confirmam a alteração. Após queda de conexão, o quadro fica bloqueado até recuperar o snapshot. A identidade e a permissão retomáveis usam um token opaco em sessionStorage e registros em memória no servidor; reiniciar o servidor mantém o conteúdo, mas reinicia essas identidades e permissões.

A arquitetura mantém o **único lobby aberto** do TuPi. Não existem contas, organizações ou outras salas: quem pode entrar no lobby pode ler seu quadro persistente, inclusive participantes futuros. Para restringir o público, use a autenticação existente no proxy de implantação. O quadro não cria autenticação de contas nem promete isolamento entre organizações inexistentes. Pedidos de outra sala são recusados, sockets fora do lobby não recebem o conteúdo e os arquivos de dados não são servidos por HTTP. PNG/PDF são gerados localmente a partir do conteúdo recebido, sem URLs públicas de exportação. Depois de baixar um arquivo, seu acesso depende de quem controla esse arquivo.

Exportações abrangem os limites reais de todos os elementos, inclusive textos que ultrapassam suas caixas. PNG e PDF usam renderização local em alta resolução; PDF contém imagem e não texto selecionável. Quadros excessivamente grandes exibem erro em vez de produzir uma imagem ilegível. Limites: 2000 elementos, 1500 pontos por traço, 4000 caracteres por texto e 8 MiB de estado. Não foi adicionada biblioteca de produção; a implementação usa SVG, Pointer Events, Canvas e as dependências existentes.

Validação: `npm run check` e `npm test`. O teste adicional `npm run test:browser` usa o Playwright declarado nas dependências de desenvolvimento (instaladas com `npm ci`) e requer Edge instalado. Para usar o Chromium do Playwright, execute `npx playwright install chromium` e configure `BROWSER_CHANNEL=chromium`. O teste usa duas sessões isoladas, servidor temporário na porta 3139 e dados temporários. Cobre ferramentas, sincronização, histórico individual, tentativa direta de escrita em visualização, recusa de outra sala, reabertura, reconexão, geração PNG/PDF e acesso pelos botões reais da chamada. Valida também o seletor de três modos, propriedades contextuais, atalhos separados, digitação e layouts de desktop, tablet e celular; gera capturas em `test-results/whiteboard/`, pasta ignorada pelo Git. Validação física de gestos em tablet e redes externas continua manual.


### Composição de tela, YouTube e quadro

Os três recursos podem funcionar simultaneamente. Abrir o quadro ou o YouTube preserva a transmissão de tela e os outros painéis; fechar um recurso afeta apenas ele. O YouTube continua com abertura e fechamento compartilhados entre os participantes. Destaque, proporções e ampliação são escolhas locais de cada pessoa.

Com um painel, o palco é ocupado por inteiro; com dois, o espaço é dividido; com três, o painel em destaque fica maior e os outros dois ao lado. Use **Dar destaque** no cabeçalho para escolher o principal e **Ampliar painel** para trabalhar temporariamente em um deles, preservando os demais em execução. Em desktop, o divisor entre as colunas pode ser arrastado ou ajustado com as setas do teclado (Home/End definem os limites). Em telas estreitas, a composição fica empilhada e o painel principal recebe mais altura.

Quando o YouTube fica pequeno, o botão **Controles do YouTube** reúne link, reprodução, posição, volume e sincronização em um diálogo próprio; o vídeo permanece no painel. Ao ampliar, esses controles voltam ao painel. A composição é implementada em `public/js/features/stage-layout.js` e `public/css/stage-layout.css`.

`npm run test:browser` também valida os três painéis em duas sessões, continuidade da faixa WebRTC gerada por canvas, player YouTube simulado (sem dependência de acesso externo), fechamento independente, controles compactos, destaque, ampliação, divisor e tamanhos desktop/tablet/celular. O teste não substitui a validação de reprodução real do YouTube e captura do sistema operacional.
