# PeerTalk — MVP WebRTC P2P

Sala minimalista para **2 pessoas** com voz, compartilhamento de tela e chat de texto.

## Requisitos
- Node.js 20+
- Chrome, Edge ou Firefox recente

## Rodar localmente

```bash
npm install
npm start
```

O endereço IPv6 usado apenas na mensagem de inicialização fica em `.env` (esse arquivo é ignorado pelo Git). Copie `.env.example` para `.env` e preencha `IPV6=` com o endereço público. Se preferir, configure `IPV6` diretamente nas variáveis de ambiente do serviço.

Abra **http://localhost:3000** em duas abas do mesmo computador. Clique em **Criar sala** na primeira, copie o link e abra na segunda. Ative microfone e/ou compartilhe a tela. Use fones para evitar microfonia ao testar no mesmo dispositivo.

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
- `POST /api/rooms` cria uma sala com ID aleatório de 128 bits.
- `ws(s)://.../signal` encaminha SDP/ICE entre os dois participantes, sem manipular a mídia.
- `RTCPeerConnection` transporta microfone (áudio) e tela (vídeo).
- `RTCDataChannel` transporta texto diretamente entre os navegadores.
- As salas e mensagens ficam somente em memória; as salas são removidas quando o último usuário desconecta.

## Limitações intencionais do MVP
- **Sem TURN configurado por padrão:** algumas redes corporativas, CGNATs e NATs restritivos não conseguirão conexão. Configure credenciais TURN em `public/app.js` antes de publicar.
- **Não é E2EE com verificação de identidade:** WebRTC cifra mídia e dados em trânsito (DTLS/SRTP), mas um servidor de sinalização não confiável pode realizar ataques de intermediação. Para maior proteção, implemente autenticação de pares e verificação de identidade.
- Salas sem expiração enquanto houver cliente conectado; salas recém-criadas sem entrada podem permanecer em memória até reinício. Para produção, inclua TTL e limites de criação.
- Se o criador fechar a sala e a outra pessoa continuar, o link permanece válido enquanto houver participante.
- O endereço da sala é um token de acesso: quem o conhece pode entrar, caso exista uma vaga.
- Sem persistência, reconexão automática, proteção robusta antiabuso, rate limiting ou telemetria.
- O MVP não transmite áudio da aba/sistema durante compartilhamento de tela; apenas áudio do microfone.
- O navegador controla quais telas podem ser capturadas e pode bloquear autoplay até interação do usuário.

## Organização

```
peertalk-mvp/
├── package.json
├── server.js          # HTTP + WebSocket para sinalização
├── public/
│   ├── index.html     # interface
│   ├── style.css      # estilos responsivos
│   └── app.js         # WebRTC, captura e chat
└── README.md
```
