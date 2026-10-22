# TuPi — comunicação P2P no navegador

Sala minimalista para **2 pessoas** com voz, compartilhamento de tela e chat de texto.

A interface oferece criação de sala ou entrada pelo nome de uma fruta ou pelo link de convite. Cada sala recebe uma fruta disponível entre dez opções; por isso, até dez salas podem estar ativas ao mesmo tempo. Os links usam o nome da fruta, por exemplo `?room=manga`; o ID aleatório é usado apenas internamente pelo servidor. Microfone, câmera e captura de tela só são ativados quando cada pessoa escolhe os controles na sala. Em “Dispositivos e áudio”, cada participante pode selecionar microfone/câmera e alternar entre processamento padrão (redução de eco/ruído e ganho automático, se suportados) e áudio natural. O visual usa a identidade TuPi e se adapta a telas grandes e celulares.

## Requisitos
- Node.js 20+
- Chrome, Edge ou Firefox recente

## Rodar localmente

```bash
npm install
npm start
```

Configurações locais ficam em `.env` (ignorado pelo Git). Copie `.env.example` para `.env`; `IPV6=` só afeta a mensagem de inicialização. STUN/TURN é opcional para teste local, mas TURN pode ser necessário para redes restritivas. Defina `ICE_SERVERS` como array JSON, por exemplo `[{"urls":["stun:stun.seudominio:3478"]}]`, ou use `STUN_URL`, `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`. Não salve credenciais permanentes em um repositório. Valores TURN enviados ao navegador são visíveis aos participantes; prefira credenciais temporárias emitidas pelo serviço TURN.

Abra **http://localhost:3000** em duas abas do mesmo computador. Clique em **Criar nova sala** na primeira e digite o nome da fruta exibido na segunda, ou abra o link de convite. Ative microfone, câmera e/ou tela independentemente pelos controles. Use fones para evitar microfonia ao testar no mesmo dispositivo.

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
- `POST /api/rooms` cria uma sala com nome único de fruta e ID interno aleatório de 128 bits.
- `GET /api/rooms/:nome-ou-id` resolve o nome manual da fruta ou o ID de um link ativo.
- `GET /api/config` entrega a configuração pública de ICE; credenciais TURN disponibilizadas ao browser podem ser inspecionadas pelos participantes.
- `ws(s)://.../signal` encaminha SDP/ICE entre os dois participantes, sem manipular a mídia.
- `RTCPeerConnection` transporta microfone, câmera e tela por faixas de envio independentes; cada navegador controla suas fontes sem ligar dispositivos automaticamente.
- `RTCDataChannel` transporta texto diretamente entre os navegadores.
- O aviso sonoro de novas mensagens vem ativado e toca para cada mensagem recebida; o botão **Som** permite silenciá-lo, e a preferência fica salva neste navegador. O áudio só começa após uma interação do usuário, conforme as regras do navegador. Mensagens recebidas com o chat fechado ou a aba em segundo plano acendem uma bolinha no botão **Chat** até o painel ser aberto.
- Um canal `RTCDataChannel` separado transporta arquivos diretamente entre os navegadores. O recebimento pede consentimento, valida os blocos com SHA-256 encadeado e permite cancelar a transferência.
- YouTube Watch Together usa um terceiro canal P2P para sincronizar o vídeo incorporado em cada navegador; o servidor TuPi não recebe nem retransmite vídeo.
- As salas e mensagens ficam somente em memória; as salas são removidas quando o último usuário desconecta.
- Salas criadas sem ninguém entrar expiram após cinco minutos; quando a última pessoa sai, a sala é removida imediatamente. O servidor limita criação, consultas, conexões por endereço e mensagens de sinalização; os limites em processo único reduzem abuso básico, mas não substituem proteção distribuída.
- Cabeçalhos CSP e de segurança restringem scripts e embeds ao TuPi e ao player do YouTube. O serviço não registra conteúdo de chat, arquivos, SDP ou mídia.

## Qualidade e diagnóstico

Ao clicar em **Compartilhar**, a pessoa escolhe o perfil de tela (480p a 1440p, tentativa Ultra 4K60 ou resolução nativa), FPS (30 a 144), bitrate máximo desejado e foco automático/jogo/vídeo; o botão para iniciar a captura fica no rodapé desse menu. A câmera continua com o perfil padrão de captura e pode ser ligada/desligada e ter o dispositivo selecionado em **Mais**. Os valores de tela são solicitações; navegador, dispositivo, capturador e rede podem aplicar valores menores. O painel mostra configurações efetivas da captura, codecs divulgados pelo navegador, bitrate/FPS medidos, RTT, jitter, perda, estado ICE e indicação de relay TURN quando identificável. Durante o compartilhamento, a resolução e o FPS efetivos ficam no indicador da tela. Um ajuste adaptativo conservador reduz o teto de envio após congestionamento persistente e o recupera gradualmente quando a rede estabiliza.

A lista de codecs usa as capacidades anunciadas pelo navegador. A Web API não oferece uma forma interoperável de confirmar que o encoder de hardware está ativo; a aplicação não promete aceleração por GPU nem captura/encode de 4K60.

## Transferência de arquivos

Na sala, escolha um arquivo em **Transferir arquivo**. A outra pessoa precisa aceitar o recebimento; a transferência começa somente depois do consentimento. Os navegadores compatíveis com `showSaveFilePicker` gravam os blocos diretamente no destino escolhido, sem manter o arquivo inteiro na memória. Nos demais navegadores, o arquivo é montado em memória até o limite de 64 MiB. Acima desse limite o recebimento é recusado, e o usuário precisa usar um navegador com gravação direta em disco.

O canal usa blocos de 64 KiB, controle de fluxo pelo buffer do DataChannel e pausa quando o ajuste adaptativo de qualidade detecta congestionamento. Cada bloco tem hash SHA-256 conferido antes de ser gravado; a transferência também valida a ordem, a quantidade de blocos e o tamanho total antes de concluir. O limite máximo de oferta é 20 GiB; limites reais podem ser menores por navegador ou espaço em disco. A transferência usa WebRTC P2P (ou TURN quando necessário), não passa pelo servidor TuPi. Só há uma transferência ativa por sala; sair da sala ou desconectar cancela e limpa o estado.

### YouTube Watch Together

Na sala, abra **YouTube**, cole um link ou ID de vídeo e selecione **Abrir vídeo**. Cada pessoa recebe o mesmo vídeo e o reproduz do YouTube no próprio navegador. Reproduzir, pausar e buscar posição são enviados pelo canal de controle P2P; o criador da sala envia snapshots periódicos para corrigir divergências. A tolerância de sincronização pode ser ajustada na interface. O player incorporado depende de disponibilidade do vídeo, permissão de incorporação, conexão com o YouTube e suporte/autoplay do navegador. Quando o autoplay estiver bloqueado, cada pessoa deve pressionar Reproduzir. Anúncios e buffering são controlados pelo YouTube e podem causar diferenças temporárias. O TuPi não baixa nem redistribui o vídeo.

## Segurança, troubleshooting e limitações
- Sem STUN/TURN configurado, a conexão pode falhar em redes com NAT restritivo. Configure ICE no `.env`; TURN consome banda e as credenciais entregues ao navegador podem ser inspecionadas.
- **Não é E2EE com verificação de identidade:** WebRTC cifra mídia e dados em trânsito (DTLS/SRTP), mas um servidor de sinalização não confiável pode realizar ataques de intermediação. Para maior proteção, implemente autenticação de pares e verificação de identidade.
- Uma sala com participante conectado permanece ativa; a sala é removida quando o último sai. Salas recém-criadas sem entrada expiram em cinco minutos.
- Se o criador fechar a sala e a outra pessoa continuar, o link permanece válido enquanto houver participante.
- O endereço da sala é um token de acesso: quem o conhece pode entrar, caso exista uma vaga.
- Salas e limites de requisição ficam em memória do processo. Rate limiting reduz abuso básico, mas não substitui proxy/WAF ou proteção distribuída em implantação pública.
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

Os testes automatizados cobrem as rotas e o limite de participantes do servidor. A validação de câmera, microfone, compartilhamento de tela, navegador móvel, ICE/TURN e redes diferentes ainda exige teste manual.

## Organização

```
TuPi/
├── package.json
├── server.js          # HTTP + WebSocket para sinalização
├── public/
│   ├── assets/        # marca vetorial local
│   ├── js/            # UI, sinalização, WebRTC, mídia e chat
│   ├── index.html     # interface
│   ├── style.css      # estilos responsivos
│   └── app.js         # inicialização e ciclo de vida
└── README.md
```
