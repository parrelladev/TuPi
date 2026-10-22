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

O endereço IPv6 usado apenas na mensagem de inicialização fica em `.env` (esse arquivo é ignorado pelo Git). Copie `.env.example` para `.env` e preencha `IPV6=` com o endereço público. Se preferir, configure `IPV6` diretamente nas variáveis de ambiente do serviço.

Abra **http://localhost:3000** em duas abas do mesmo computador. Clique em **Criar nova sala** na primeira e digite o nome da fruta exibido na segunda, ou abra o link de convite. Ative microfone, câmera e/ou tela independentemente pelos controles. Use fones para evitar microfonia ao testar no mesmo dispositivo.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Teste com computadores diferentes

`localhost` é considerado contexto seguro pelos navegadores. Para outro dispositivo na rede, o acesso por `http://IP-DA-MAQUINA:3000` **não** é contexto seguro e pode bloquear `getUserMedia` e `getDisplayMedia`. Publique o site **sob HTTPS** e use **WSS** para sinalização; em produção configure `HOST=0.0.0.0` atrás de proxy reverso TLS (Nginx/Caddy), ou use um túnel HTTPS confiável.

Exemplo de inicialização em rede (ainda exige proxy HTTPS para mídia noutros dispositivos):

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

## Como funciona
- `POST /api/rooms` cria uma sala com nome único de fruta e ID interno aleatório de 128 bits.
- `GET /api/rooms/:nome-ou-id` resolve o nome manual da fruta ou o ID de um link ativo.
- `ws(s)://.../signal` encaminha SDP/ICE entre os dois participantes, sem manipular a mídia.
- `RTCPeerConnection` transporta microfone, câmera e tela por faixas de envio independentes; cada navegador controla suas fontes sem ligar dispositivos automaticamente.
- `RTCDataChannel` transporta texto diretamente entre os navegadores.
- Um canal `RTCDataChannel` separado transporta arquivos diretamente entre os navegadores. O recebimento pede consentimento, valida os blocos com SHA-256 encadeado e permite cancelar a transferência.
- YouTube Watch Together usa um terceiro canal P2P para sincronizar o vídeo incorporado em cada navegador; o servidor TuPi não recebe nem retransmite vídeo.
- As salas e mensagens ficam somente em memória; as salas são removidas quando o último usuário desconecta.

## Qualidade e diagnóstico

Ao clicar em **Compartilhar**, a pessoa escolhe o perfil de tela (480p a 1440p, tentativa Ultra 4K60 ou resolução nativa), FPS (30 a 144), bitrate máximo desejado e foco automático/jogo/vídeo; o botão para iniciar a captura fica no rodapé desse menu. A câmera continua com o perfil padrão de captura e pode ser ligada/desligada e ter o dispositivo selecionado em **Mais**. Os valores de tela são solicitações; navegador, dispositivo, capturador e rede podem aplicar valores menores. O painel mostra configurações efetivas da captura, codecs divulgados pelo navegador, bitrate/FPS medidos, RTT, jitter, perda, estado ICE e indicação de relay TURN quando identificável. Durante o compartilhamento, a resolução e o FPS efetivos ficam no indicador da tela. Um ajuste adaptativo conservador reduz o teto de envio após congestionamento persistente e o recupera gradualmente quando a rede estabiliza.

A lista de codecs usa as capacidades anunciadas pelo navegador. A Web API não oferece uma forma interoperável de confirmar que o encoder de hardware está ativo; a aplicação não promete aceleração por GPU nem captura/encode de 4K60.

## Transferência de arquivos

Na sala, escolha um arquivo em **Transferir arquivo**. A outra pessoa precisa aceitar o recebimento; a transferência começa somente depois do consentimento. Os navegadores compatíveis com `showSaveFilePicker` gravam os blocos diretamente no destino escolhido, sem manter o arquivo inteiro na memória. Nos demais navegadores, o arquivo é montado em memória até o limite de 64 MiB. Acima desse limite o recebimento é recusado, e o usuário precisa usar um navegador com gravação direta em disco.

O canal usa blocos de 64 KiB, controle de fluxo pelo buffer do DataChannel e pausa quando o ajuste adaptativo de qualidade detecta congestionamento. Cada bloco tem hash SHA-256 conferido antes de ser gravado; a transferência também valida a ordem, a quantidade de blocos e o tamanho total antes de concluir. O limite máximo de oferta é 20 GiB; limites reais podem ser menores por navegador ou espaço em disco. A transferência usa WebRTC P2P (ou TURN quando necessário), não passa pelo servidor TuPi. Só há uma transferência ativa por sala; sair da sala ou desconectar cancela e limpa o estado.

### YouTube Watch Together

Na sala, abra **YouTube**, cole um link ou ID de vídeo e selecione **Abrir vídeo**. Cada pessoa recebe o mesmo vídeo e o reproduz do YouTube no próprio navegador. Reproduzir, pausar e buscar posição são enviados pelo canal de controle P2P; o criador da sala envia snapshots periódicos para corrigir divergências. A tolerância de sincronização pode ser ajustada na interface. O player incorporado depende de disponibilidade do vídeo, permissão de incorporação, conexão com o YouTube e suporte/autoplay do navegador. Quando o autoplay estiver bloqueado, cada pessoa deve pressionar Reproduzir. Anúncios e buffering são controlados pelo YouTube e podem causar diferenças temporárias. O TuPi não baixa nem redistribui o vídeo.

## Limitações intencionais do MVP
- **Sem TURN configurado por padrão:** algumas redes corporativas, CGNATs e NATs restritivos não conseguirão conexão. Configure credenciais TURN em `public/app.js` antes de publicar.
- **Não é E2EE com verificação de identidade:** WebRTC cifra mídia e dados em trânsito (DTLS/SRTP), mas um servidor de sinalização não confiável pode realizar ataques de intermediação. Para maior proteção, implemente autenticação de pares e verificação de identidade.
- Salas sem expiração enquanto houver cliente conectado; salas recém-criadas sem entrada podem permanecer em memória até reinício. Para produção, inclua TTL e limites de criação.
- Se o criador fechar a sala e a outra pessoa continuar, o link permanece válido enquanto houver participante.
- O endereço da sala é um token de acesso: quem o conhece pode entrar, caso exista uma vaga.
- Sem persistência, reconexão automática, proteção robusta antiabuso, rate limiting ou telemetria.
- O TuPi não transmite áudio da aba/sistema durante compartilhamento de tela; apenas áudio do microfone. Áudio da captura de tela ainda não está implementado.
- O navegador controla quais telas podem ser capturadas e pode bloquear autoplay até interação do usuário.

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
