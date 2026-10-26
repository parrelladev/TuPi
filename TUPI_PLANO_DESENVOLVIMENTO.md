# TuPi — Plano de evolução para a versão 2.0 estável

> **Revisão:** 23/10/2026 · **Idioma:** português brasileiro.
> **Estado do produto:** recursos centrais implementados; candidato a beta controlada, com pendências para lançamento estável público.
> **Objetivo deste plano:** consolidar a base existente, corrigir riscos comprovados e produzir evidências de qualidade para a 2.0.
> **Escopo desta revisão:** planejamento e documentação; nenhuma tarefa futura está marcada como executada por esta edição.

## 0. Fonte de verdade e regras de execução

Este plano substitui o roteiro anterior de construção do produto. Não reiniciar os antigos M0–M9 nem reimplementar recursos já presentes. Inspecionar o checkout e o status do Git antes de trabalhar; há alterações locais de M10 que devem ser preservadas.

Referências:

- [Parecer de maturidade](PARECER_V2.0.md): avaliação que motivou esta revisão.
- [Relatório M10](M10_RELATORIO.md): métodos, resultados locais e lacunas.
- [Evidências M10](docs/m10/): inventário, amostras, saída de testes e imagem da sessão local.
- [Plano anterior preservado](docs/PLANO_HISTORICO_2026-10-23.md): histórico de decisões e entregas; não é o roteiro vigente.
- [README](README.md) e [.env.example](.env.example): comportamento e configuração atualmente publicados.

Regras para cada etapa:

1. Trabalhar somente no escopo solicitado pelo proprietário. Uma solicitação de revisão do plano não autoriza executar suas implementações.
2. Ler a etapa, inspecionar os arquivos afetados e apresentar brevemente mudanças, riscos e validações previstas.
3. Reutilizar uma branch adequada; para novas branches, usar `codex/<etapa>`. Preservar alterações existentes e manter a branch principal funcional. Não exigir worktree novo.
4. Fazer alterações pequenas; preservar `npm start`, limite de dois peers e recursos existentes. Refatoração somente se necessária à correção, com justificativa e regressão verificada.
5. Priorizar APIs nativas e `node:test`. Não introduzir dependências pesadas ou infraestrutura por conveniência.
6. Distinguir implementação, análise estática, teste automatizado de servidor, teste de navegador e teste em dois computadores/redes. Não inferir aprovação de uma matriz inteira a partir de um relato geral.
7. Registrar todas as falhas observadas, inclusive quando uma repetição passa. Não aumentar timeouts ou remover asserções apenas para obter aprovação.
8. Ao concluir, entregar resumo, arquivos, comandos, evidências, aceites atendidos e pendências. Não iniciar automaticamente a etapa seguinte sem escopo autorizado.
9. Se faltar ambiente, concluir o trabalho independente e registrar o cenário como pendente. Não inventar dispositivos, credenciais, medições ou serviços.

## 1. Produto e decisões consolidadas

TuPi é uma aplicação web leve, self-hosted, para comunicação entre **até duas pessoas por sala**, com foco em computadores domésticos, gamers e compartilhamento de imagem. A 2.0 deve consolidar a experiência atual com confiabilidade demonstrada.

### Capacidades da 2.0

- Criar sala e entrar por convite sem conta, com ingresso protegido contra descoberta trivial.
- Entrar com os dispositivos desligados; controlar microfone, câmera e tela independentemente em ambos os peers.
- Selecionar microfone/câmera e processamento de áudio padrão ou natural.
- Ajustar qualidade da tela e apresentar valores efetivos e diagnóstico; câmera mantém o perfil padrão e seleção de dispositivo.
- Exibir duas telas e câmeras sem substituir involuntariamente uma fonte pela outra.
- Trocar mensagens e arquivos P2P com consentimento, progresso, cancelamento e verificação de integridade.
- Assistir ao YouTube com comandos e posição sincronizados nos cenários suportados.
- Hospedar com comandos Node documentados, sem build obrigatório de frontend.

### Decisões já tomadas pelo proprietário

| Tema | Diretriz vigente |
| --- | --- |
| Público principal | Computadores domésticos; suporte mobile limitado ao que for realmente validado. |
| TURN | Opcional e configurável. Nenhum serviço será provisionado ou exigido como condição da 2.0 doméstica. |
| Configuração ICE | Preservar `ICE_SERVERS` ou `STUN_URL` / `TURN_URL` / credenciais em `.env`. |
| Interface | Preservar a identidade aprovada, Home simples, sala com prioridade para mídia e controles acessíveis. |
| Marca | Preservar o logo PNG fornecido; redesenho SVG não é condição do lançamento. |
| Câmera | Perfil padrão de captura; painel avançado de qualidade da câmera retirado do escopo. |
| Áudio de aba/sistema | Continua adiado; compartilhamento de tela não deve prometer esse áudio. |
| Encerramento | Quem permanece pode aguardar; última saída remove a sala, salvo ajuste fundamentado em V2-04. |
| Confirmação funcional | Proprietário relatou projeto testado e funcionando; registrar detalhes adicionais quando disponíveis. |
| Controle remoto | Antigo M11 é pesquisa futura, fora da 2.0 e sem implementação de produto autorizada. |

Mesmo redes domésticas podem exigir relay. Sem TURN, aceitar e comunicar que algumas conexões não se estabelecem. Não prometer compatibilidade universal, 4K60, aceleração por GPU ou latência fixa.

### Fora do escopo

Mais de dois participantes, SFU, contas obrigatórias, gravação central, armazenamento de mídia/arquivos no servidor, banco obrigatório, Docker, framework obrigatório de frontend, controle remoto, rebranding e reescrita arquitetural. Não contornar DRM, autoplay, permissões ou restrições do YouTube.

## 2. Base real e evidências disponíveis

Base da avaliação: commit `de38b09` e alterações locais em `codex/m10-network-validation`. A versão declarada no pacote, lockfile e rodapé ainda é `1.0.0`; não mudar a versão antes da etapa de lançamento.

### Estrutura atual a preservar

```text
TuPi/
├── server.js
├── package.json / package-lock.json
├── public/
│   ├── app.js
│   ├── index.html / style.css
│   ├── assets/                         # PNG e favicon locais
│   └── js/
│       ├── ui.js
│       ├── core/                      # signaling, peer, quality, stats
│       └── features/                  # media, chat, files, youtube
├── tests/server.test.js
├── scripts/                           # sintaxe e medições M10
├── docs/m10/
├── .env.example
└── README.md
```

| Área | Implementado agora | Evidência e limite |
| --- | --- | --- |
| Execução | Node 20+, `node:http`, `ws`, scripts start/dev/check/test | Node 22.23.3, npm 10.9.9 e ws 8.22.0 usados na avaliação; Node mínimo e outros SOs ainda exigem registro. |
| Salas | Map em memória, dez frutas, ID interno de 128 bits, limite de dois, TTL de 5 min para sala nunca ocupada | Testes de criação, consultas, ingresso, saída e isolamento; privacidade do convite por fruta reprovada no parecer. |
| Frontend | ES modules nativos, UI clara responsiva e identidade aprovada | Aprovação do proprietário e sessão local em navegador; sem certificação ampla de versões. |
| Mídia | Senders/transceivers independentes de áudio, câmera e tela, troca de dispositivos | Implementação presente; falta matriz detalhada de combinações e falhas. |
| Qualidade | Perfis de tela, constraints, bitrate desejado, adaptação e `getStats()` | Diagnóstico soma bitrate de vídeo enviado e usa perda acumulada; não mede sozinho envio/recebimento por fonte. |
| Dados | Canais messages/files/control; hashes por bloco, fallback em RAM até 64 MiB e oferta até 20 GiB | Limites de implementação, não tamanhos máximos já certificados em teste real. |
| Rede | Retry de WebSocket, tentativa de ICE restart, configuração ICE e orientação HTTPS/WSS | Reentrada local comprovada; quedas abruptas e recuperação simultânea sem caracterização. |
| Segurança básica | CSP, validação de mensagens, limites e heartbeat | Proteções existentes não tornam secreto um convite previsível. |

### Histórico de evidências e pendências

- Antigos M0–M2: baseline, módulos e interface registrados/aprovados no histórico. `M0_BASELINE.md` é citado no plano antigo, mas não existe no checkout; não tratá-lo como evidência disponível.
- Antigos M3–M6 e M9: recursos implementados, com aceite detalhado de mídia, arquivos, YouTube e notificações ainda a consolidar. Não apagar a confirmação funcional do proprietário.
- Antigo M8: hardening e self-host implementados; validação de redes e desempenho transferida ao M10.
- M10: seis testes originais ampliados para nove; duas abas reais trocaram chat nos dois sentidos, saíram/reentraram e confirmaram limpeza do convite após a última saída.
- Na avaliação posterior, `npm run check` passou; `npm test` teve **8/9 com timeout**, seguido de **9/9 sem mudanças**. Isso é instabilidade observada, com causa ainda indeterminada.
- Assets M10: 14 arquivos em `public/`, 788281 bytes brutos; JS/CSS/SVG somam 114958 bytes. Gzip é apenas comparação, não compressão servida pelo backend atual.
- Servidor com dois peers ociosos: 30,005 s, RSS de 60300–60304 KiB; zero ticks de CPU observados à resolução de 10 ms/tick. Não representa uso de mídia nos navegadores.
- Parecer: cliente sem convite descobriu sala consultando até dez frutas e entrou na vaga disponível, em servidor local isolado. Não foi comprovada interceptação de sala já ocupada por dois peers.

Os relatórios M10 e de maturidade são registros datados. Resultados futuros devem ser anexados com data/commit; não reescrever falhas históricas como se nunca tivessem ocorrido.

## 3. Arquitetura e contratos a preservar

- Manter Node/HTTP/ws no backend e HTML/CSS/ES modules no frontend. Não criar a antiga árvore-alvo de módulos apenas para cumprir um desenho.
- Mídia e DataChannels trafegam via WebRTC; o servidor não deve receber arquivos para armazenamento nem decodificar/transcodificar mídia.
- Salas em memória são adequadas ao escopo. Reinício de processo perde as salas; persistência não é requisito.
- Preservar os caminhos `POST /api/rooms`, `GET /api/config`, `GET /api/rooms/:codigo` e `/signal`. A semântica de autorização por código deve mudar em V2-01, com migração documentada.
- Validar os payloads no servidor e nos canais de dados. Se o contrato mudar, documentar compatibilidade; evitar misturar clientes com protocolos incompatíveis.
- Preservar fontes independentes, transceivers estáveis e identificação de tracks; corrigir associação/negociação se um caso real ou teste reproduzir falha. Não exigir perfect negotiation como reescrita preventiva.
- Distinguir conexão de sinalização, sessão WebRTC e estado da UI. O fluxo deve informar quando aguarda, negocia, conecta, tenta recuperar, falha ou encerra; não exige nova biblioteca de estado.
- Manter cleanup explícito de tracks, canais, timers e listeners. Não ativar captura automaticamente ao reconectar.
- Alterações em privacidade ou lifecycle devem incluir testes de regressão e instrução de compatibilidade para convites antigos.

## 4. Sequência de evolução e condições de passagem

Os novos IDs **V2-01 a V2-06** evitam confusão com o histórico M0–M11. Todos começam pendentes. O próximo marco recomendado é **V2-01**; esta revisão do plano não o executa.

| Ordem | Marco | Dependência | Resultado esperado |
| --- | --- | --- | --- |
| 1 | V2-01 — Ingresso protegido | Base atual | Descobrir uma fruta não concede acesso à sala. |
| 2 | V2-02 — Testes confiáveis | V2-01 | Causa do timeout determinada e regressão automatizada consistente. |
| 3 | V2-03 — Aceite funcional integrado | V2-01 e V2-02 | Matriz de recursos validada em dois computadores. |
| 4 | V2-04 — Redes, desempenho e estabilidade | V2-03 | Sessão prolongada, falhas e métricas com mídia registradas. |
| 5 | V2-05 — Candidata a lançamento | V2-01 a V2-04 | Pacote reproduzível, documentação e versão RC coerentes. |
| 6 | V2-06 — Liberação estável | V2-05 | Regressão final e decisão de lançamento registradas. |

Preparar documentos e ambientes de uma etapa posterior é permitido quando fizer parte do pedido e não depender de resultado pendente. Não aprovar a etapa sem suas evidências. Regressão crítica de conexão, áudio, fontes independentes, chat, integridade de arquivos ou limite de dois impede promover a versão.

### V2-01 — Proteger convites e acesso às salas

**Status:** implementado e validado localmente em 23/10/2026; ver [evidências e limitações](docs/v2/V2-01_RELATORIO.md). Ingresso em dois computadores permanece pendente em V2-03. **Motivo:** descoberta e ingresso sem convite reproduzidos. **Prioridade:** corrigir antes da distribuição pública com promessa de privacidade.

**Direção técnica proposta:** aproveitar o identificador aleatório de 128 bits existente como credencial de convite, após verificar todo o seu percurso. A fruta permanece rótulo visual; entrada manual aceita código completo ou link. Não adicionar contas, banco ou autenticação externa.

- [x] Mapear criação, consulta, convite, ingresso WebSocket e logs para impedir que o segredo seja obtido somente por uma fruta.
- [x] Gerar/compartilhar convite imprevisível e validá-lo também no servidor, na consulta e no ingresso. ID interno isoladamente aleatório não basta se alguma rota o revela por nome previsível.
- [x] Impedir a resolução pública de fruta para a credencial. A lista conhecida de dez frutas não pode localizar e conceder ingresso a uma sala.
- [x] Atualizar Home, copiar convite, entrada manual e mensagens de código inválido/expirado. Explicar claramente que o nome exibido da fruta não é o código completo de acesso.
- [x] Avaliar entrada apenas por fruta: dispensada em favor do código/link completo; não há fallback ou fluxo de aprovação a implementar.
- [x] Definir migração: convites antigos apenas por fruta deixam de conceder acesso e exibem orientação para solicitar novo convite. Não redirecionar silenciosamente para o convite secreto.
- [x] Preservar limite de dois, separação de salas, expiração e configuração ICE. Não registrar credenciais, convites completos ou SDP em logs.
- [x] Adicionar testes positivos de convite válido e negativos de fruta, código incorreto, expirado, terceiro peer e cliente sem credencial; repetir o cenário de descoberta do parecer esperando recusa.

**Arquivos prováveis:** `server.js`, `public/app.js`, UI/HTML de entrada, `tests/server.test.js`, `README.md`.

**Risco:** compatibilidade dos convites antigos e confusão entre nome e código. Validar o fluxo ponta a ponta antes de remover caminhos antigos de ingresso.

**Aceite:** dois peers autorizados entram sem conta; fruta conhecida não revela segredo nem concede acesso; terceiro é recusado; convite removido não pode ser reutilizado. Tratar o link como credencial de portador, sem alegar identidade verificada dos participantes.

### V2-02 — Tornar a regressão automatizada confiável

**Status:** pendente. **Objetivo:** distinguir falha de fixture de falha do produto e resolver a causa, sem mascarar o timeout.

- [ ] Reproduzir e instrumentar o teste de limite/última saída com logs locais mínimos e sanitizados; preservar as saídas de falha e o ambiente.
- [ ] Verificar a ordem entre fechamento local do socket, evento no servidor, remoção da sala e tentativa seguinte de ingresso. Essa é hipótese de investigação, não diagnóstico confirmado.
- [ ] Sincronizar o teste com comportamento observável/eventos ou consulta limitada ao estado final. Evitar sleeps arbitrários e simples aumento de timeout como solução.
- [ ] Isolar credenciais e configuração `.env`; impedir que fixtures ou rate limits compartilhados criem dependência incidental da ordem dos testes.
- [ ] Cobrir a correção de V2-01 e manter criação, consultas, relay de sinalização, limite de dois, saída, limpeza, isolamento e configuração pública de ICE.
- [ ] Acrescentar casos focados de segurança/limites somente quando verificarem contratos relevantes; não buscar uma contagem arbitrária de testes.
- [ ] Melhorar diagnóstico e encerramento do servidor filho: erro de startup legível, prazo finito e ausência de processos/sockets pendurados, inclusive quando uma asserção falha.
- [ ] Executar `npm run check`, `npm test` e dez execuções consecutivas da suíte em processos novos no ambiente registrado. Repetição serve para investigar a instabilidade já observada, não como garantia universal.

**Arquivos prováveis:** `tests/server.test.js`, helpers pequenos se necessários, scripts de checagem; código de produção somente se a causa o exigir.

**Aceite:** causa e correção documentadas, asserções preservadas e dez execuções sem falha intermitente ou skip de cenário crítico. Registrar Node/SO/duração e qualquer limitação do sandbox separadamente de falha funcional.

### V2-03 — Consolidar o aceite funcional da 2.0

**Status:** pendente. **Objetivo:** registrar o que já funciona e corrigir apenas regressões reproduzidas.

- [ ] Identificar dispositivos, SOs, versões de navegador e cenários dos testes já feitos pelo proprietário. Aproveitar evidências específicas existentes; não exigir repetir tudo por falta de automação.
- [ ] Executar a matriz da seção 5 em dois computadores reais, com áudio audível e fontes remotas verificadas. Duas abas locais continuam úteis, mas não substituem esse ensaio.
- [ ] Validar microfone/câmera/tela independentes, seleção e troca de dispositivos, permissão negada, captura cancelada/encerrada e ausência de API.
- [ ] Validar chat nos dois sentidos, leitura/não lidas, som ligado/desligado e restrições de autoplay; falha sonora não pode interromper a mensagem.
- [ ] Validar arquivos vazios, pequenos, acima de 64 MiB quando houver gravação direta, recusa, cancelamento em ambos e saída durante envio. Comparar hash do arquivo original/final, além dos hashes por bloco do protocolo.
- [ ] Validar navegador sem gravação incremental: aceitar dentro do limite, recusar acima dele com explicação e sem consumo ilimitado de RAM. Documentar o maior tamanho realmente testado, sem certificar automaticamente os 20 GiB ofertáveis.
- [ ] Validar YouTube play/pause/seek, comandos concorrentes, buffering, autoplay bloqueado, vídeo indisponível e embed recusado; separar falha do serviço externo de falha no TuPi.
- [ ] Verificar a UI aprovada em desktop e viewport pequeno: duas telas equivalentes, câmeras independentes, chat e menus sem ocultar controles, teclado/foco, rótulos e mensagens compreensíveis.
- [ ] Registrar navegadores efetivamente suportados. Chrome/Edge/Firefox são candidatos citados hoje; testar ou restringir a promessa no README antes do release.

**Arquivos prováveis:** relatório/matriz em `docs/v2/`; módulos de mídia/dados/UI apenas para falhas encontradas, com casos mínimos de regressão quando úteis.

**Aceite:** todos os fluxos centrais passam nos ambientes declarados, com evidência por cenário. Uma capacidade prometida que falha deve ser corrigida ou ter o escopo explicitamente renegociado antes de promover a versão; não removê-la silenciosamente para aprovar o marco.

### V2-04 — Completar M10: redes e desempenho com mídia

**Status:** pendente; aproveita integralmente a validação local já registrada em M10.

- [ ] Registrar sessão entre dois computadores e entre duas redes domésticas distintas quando disponíveis, com HTTPS/WSS válido e configuração ICE sanitizada.
- [ ] Testar sem TURN como cenário principal; registrar sucesso direto ou limitação clara da rede. Falha por NAT restritivo deve ser diagnosticada, não transformada em promessa de conectividade universal.
- [ ] Testar perda de rede de um peer por 10 s e 60 s, retorno e queda simultânea dos dois. Registrar estados, temporizações, tracks e DataChannels antes/depois.
- [ ] Definir o resultado suportado após cada falha: recuperação quando viável ou orientação clara para reentrar/criar nova sala. Preservar remoção da sala na última saída, salvo necessidade comprovada de ajuste mínimo.
- [ ] Testar reinício do servidor: informar perda da sala sem loops de reconexão intermináveis ou indicação enganosa de conexão.
- [ ] Medir a sessão de 60 minutos com duas telas e áudio, incluindo um trecho com câmeras, chat e transferência consentida. Começar com perfil 720p30 e registrar o perfil e captura efetiva; outros perfis conforme capacidade do ambiente.
- [ ] Medir CPU/RAM dos navegadores e servidor separadamente; coletar bitrate de envio e recebimento, FPS, RTT, jitter, perda no intervalo e par ICE selecionado. Usar relatórios WebRTC do navegador se a UI não oferecer tudo.
- [ ] Amostrar a cada 5 s após 2 min de aquecimento; guardar série temporal, mediana, p95, máximos e eventos. Para testes curtos, usar janelas de 10 min por combinação relevante, sem alegar que já foram executadas.
- [ ] Repetir pelo menos dez ciclos de entrada/saída verificando liberação de tracks, canais, timers e ausência de crescimento persistente de recursos; não confundir RSS retido pelo runtime com vazamento comprovado.
- [ ] Comparar com o baseline M10, sem usar o consumo do servidor ocioso como orçamento de mídia. Fixar limites de suporte a partir das medições e de falhas perceptíveis, sem teto universal arbitrário.
- [ ] Preservar configuração TURN e validar seu parsing/retorno com dados sintéticos. Ensaio real de relay fica opcional e adiado até haver serviço disponível; teste sintético não comprova relay.

**TURN opcional:** não provisionar SaaS/servidor como requisito, não pedir segredos no chat e não bloquear a 2.0 doméstica pela ausência de ensaio real de TURN. Se alguém o configurar, credenciais entregues ao browser são visíveis; preferir temporárias. Só declarar uso real com par selecionado `relay` e tráfego observado.

**Aceite:** relatório reproduzível de rede, falhas, estabilidade e mídia nos ambientes suportados; nenhum travamento persistente, corrupção de arquivo ou perda de controle das fontes nos cenários aprovados. Limitações de rede e procedimento de recuperação explícitos. Dados ausentes permanecem pendentes ou fora do suporte declarado; TURN real é a exceção opcional já decidida.

### V2-05 — Preparar a candidata a lançamento

**Status:** pendente. **Dependência:** V2-01 a V2-04 aprovados para o escopo publicado.

- [ ] Consolidar a matriz de suporte, instruções de convite protegido, permissões, requisitos de contexto seguro e limitações de rede/arquivos/YouTube no README.
- [ ] Conferir `.env.example`, prioridade de variáveis, ICE vazio e configuração opcional STUN/TURN; não incluir credenciais reais.
- [ ] Verificar instalação em checkout limpo com `npm ci`, além de execução start/dev/check/test. O teste offline em cache de M10 não substitui instalação limpa. Usuários continuam podendo usar `npm install` conforme README.
- [ ] Registrar teste na versão mínima de Node declarada e no ambiente principal. Se o mínimo não puder ser suportado, ajustar requisito com justificativa e evidência antes de publicar.
- [ ] Verificar HTTP de todos os assets efetivamente referenciados, MIME, CSP e upgrade WebSocket atrás do proxy HTTPS escolhido. Tratar a rota SVG residual ausente se ainda existir; otimizar logo somente se necessário, preservando a marca aprovada.
- [ ] Auditar o diff final: ausência de segredos, logs de conteúdo, dependência acidental, arquivos de teste temporários e alterações não relacionadas. Avaliar dependências com ferramentas disponíveis e registrar achados pertinentes, sem declarar auditoria de segurança completa.
- [ ] Preparar `CHANGELOG.md` ou notas equivalentes com alterações desde 1.0, migração de convites, limites, navegadores e problemas conhecidos.
- [ ] Sincronizar pacote, lockfile e rodapé em `2.0.0-rc.1` quando a candidata estiver pronta. Não editar antecipadamente os relatórios históricos para mudar a versão medida.
- [ ] Registrar commit candidato, comandos e resultados. Se um defeito exigir correção, gerar nova candidata e repetir as verificações afetadas.

**Aceite:** instalação reproduzível, candidata identificável, versão coerente e documentação correspondente ao código. RC permanece candidata; a promoção estável depende de V2-06.

### V2-06 — Liberar a versão 2.0 estável

**Status:** pendente. **Dependência:** V2-05 aprovado.

- [ ] Conferir a definição de pronto da seção 12 com referências às evidências de V2-01 a V2-05.
- [ ] Executar regressão final no commit candidato: convites, dois peers, áudio/câmera/tela, chat, arquivo, YouTube e saída/reentrada nos cenários suportados. Evidências anteriores do mesmo código continuam válidas; alterações exigem reteste das áreas afetadas.
- [ ] Revisar problemas conhecidos: nenhum defeito crítico de acesso, integridade, conexão ou ciclo de vida pode ficar oculto como simples limitação.
- [ ] Registrar aceite do proprietário da candidata com escopo e limitações apresentados. Não reinterpretar a confirmação geral anterior como aprovação de código futuro.
- [ ] Atualizar pacote, lockfile, rodapé e notas para `2.0.0`, sem mudanças funcionais extras, e executar check/test sobre o estado final.
- [ ] Preparar tag/release e procedimento de retorno à versão anterior, incluindo impacto nos convites. Publicação e deploy somente quando autorizados pelo proprietário; revisar o material completo antes dessa ação.

**Aceite:** versão estável identificada, regressão e decisão de lançamento registradas; documentação e artefato correspondem ao mesmo código. Um release preparado localmente não deve ser descrito como publicado.

## 5. Matriz mínima de integração

Todos os cenários abaixo começam como **pendentes de registro específico** nesta revisão, exceto as evidências locais M10 explicitamente mencionadas na seção 2. Relato geral de funcionamento não significa reprovação nem aprovação automática de cada linha.

| ID | Cenário | Resultado para aceite | Etapa |
| --- | --- | --- | --- |
| A01 | Convite válido em dois computadores | Entrada simples, sem conta, fontes inicialmente desligadas | V2-01/03 |
| A02 | Conhecer/consultar fruta sem segredo | Sem descoberta da credencial ou ingresso automático | V2-01 |
| A03 | Terceiro participante | Recusa sem afetar os dois autorizados | V2-01/02 |
| A04 | Última saída e convite antigo | Sala removida e erro compreensível; sem ingresso em sala nova por reuso de fruta | V2-01/02 |
| A05 | Duas salas em paralelo | Sinalização e dados sem mistura | V2-02/03 |
| M01 | Dois microfones | Áudio audível nos dois sentidos, sem duplicação; usar fones no teste | V2-03 |
| M02 | Duas câmeras e duas telas | Quatro fontes de vídeo corretas, sem trocar câmera por tela | V2-03 |
| M03 | Ligar/desligar fonte ou trocar dispositivo | Outras fontes continuam; track antiga encerrada | V2-03 |
| M04 | Permissão negada/captura cancelada/API ausente | Feedback correto, possibilidade de continuar sem essa fonte | V2-03 |
| M05 | Encerrar captura no navegador | UI e envio atualizados, sem conexão derrubada indevidamente | V2-03 |
| C01 | Chat aberto/fechado/aba em segundo plano | Mensagens bidirecionais, indicador de não lidas e preferência de som corretos | V2-03 |
| F01 | Arquivo vazio/pequeno/grande no modo suportado | Consentimento e hash final correspondente; progresso coerente | V2-03 |
| F02 | Recusar/cancelar/sair durante transferência | Sem sucesso falso, estado liberado e destino parcial descartado quando aplicável | V2-03 |
| F03 | Sem gravação incremental | Limite de 64 MiB respeitado e recusa explicada acima dele | V2-03 |
| Y01 | YouTube play/pause/seek/comandos concorrentes | Mesmo vídeo e sincronização dentro da tolerância configurada após estabilizar | V2-03 |
| Y02 | Autoplay/buffering/vídeo indisponível/embed bloqueado | Estado claro e controles utilizáveis; sem promessa de sincronizar anúncios | V2-03 |
| U01 | Viewport pequeno/teclado/foco/chat/menus | Controles alcançáveis, sem transbordamento impeditivo; mídia mobile conforme suporte | V2-03 |
| N01 | Duas redes domésticas sem TURN | Resultado/rota registrados, limitações comunicadas | V2-04 |
| N02 | Queda e retorno de rede, um e ambos | Recuperação ou orientação de nova sala conforme contrato publicado | V2-04 |
| P01 | Sessão de 60 min com duas telas e áudio | Mídia utilizável, métricas e eventos registrados, fontes controláveis | V2-04 |
| P02 | Dez ciclos de entrada/saída | Recursos liberados e nenhum crescimento persistente inexplicado | V2-04 |
| I01 | Instalação limpa e start/dev/check/test | Execução documentada sem infraestrutura obrigatória extra | V2-05 |
| O01 | TURN real, se houver serviço | Par selecionado relay e tráfego nos dois sentidos | Opcional |

## 6. Evidências, medições e testes

Para novas entregas, criar arquivos em `docs/v2/` conforme necessário. Não criar relatórios vazios marcados como aprovação. Cada registro deve conter:

- Etapa, cenário/ID, data/hora, commit e diferenças locais relevantes.
- SO/Node/browser com versões, dispositivos, CPU/RAM e configuração de captura necessária à interpretação.
- Rede de cada peer sem IPs pessoais; HTTPS/WSS e configuração ICE sanitizada.
- Procedimento, duração, resultado esperado/observado, falhas e conclusão (passou/falhou/pendente/não aplicável com motivo).
- Fonte da evidência: automação, navegador do agente ou relato detalhado do proprietário; anexos sanitizados quando úteis.
- Para desempenho, amostras e método, não apenas uma captura pontual ou o valor máximo configurado.

Cálculo de bitrate: `8 × delta_bytes / delta_t_s`, com timestamps e contadores da mesma fonte/SSRC. Não atravessar resets de conexão. Separar envio/recebimento, áudio/vídeo e DataChannels quando disponíveis. Perda no intervalo usa deltas; a porcentagem acumulada da UI não substitui essa medida. Indicar unidade e convenção de CPU; medir browser/renderizador/GPU relevantes separadamente do sinalizador.

Nenhum orçamento universal de CPU, RAM, bitrate ou FPS é imposto antes da medição. Registrar o que é utilizável nos ambientes suportados e reduzir a promessa de perfil quando hardware/rede não sustentarem o solicitado. Campos indisponíveis não devem ser preenchidos com zero.

### Comandos preservados

```bash
npm install
npm start
npm run dev
npm run check
npm test
```

Ferramentas de medição existentes, opcionais:

```bash
node scripts/m10-assets.js
# Linux com getconf; substituir 12345 pelo PID confirmado do servidor:
node scripts/m10-process.js 12345 60
```

`npm run check` atual verifica entrypoint/módulos de produto; scripts novos e testes modificados devem receber checagem apropriada. Não repetir ensaios caros sem mudança, falha ou preocupação nova que os justifique. Playwright só entra como dependência se o benefício concreto justificar seu custo; testes reais com dois dispositivos continuam necessários para mídias físicas.

## 7. Segurança, privacidade e implantação

- O convite protegido é credencial de acesso, sem equivaler a autenticação da identidade. Não registrar o segredo em logs ou incluí-lo em anexos públicos.
- WebRTC cifra o transporte; não declarar E2EE com verificação de identidade. Explicar a confiança no servidor de sinalização.
- O limite de dois restringe ocupação, não substitui proteção de ingresso. Testar ambos separadamente.
- Permissões e captura são controladas pelo navegador e pela pessoa. Reconectar não deve ativar fontes que estavam desligadas.
- Validar mensagens, metadados, tamanhos, ordem e estado dos protocolos; impedir XSS e consumo ilimitado de memória. Consentimento não dispensa validação do arquivo.
- Não armazenar conteúdo de chat, arquivos ou mídia no servidor, nem adicionar telemetria/CDNs/analytics obrigatórios.
- `localhost` permite desenvolvimento local; acesso remoto de captura exige HTTPS/WSS válido. O backend não termina TLS; proxy opcional para localhost e necessário conforme a implantação remota escolhida.
- `TRUST_PROXY` só deve ser ativado com proxy confiável que sobrescreve o cabeçalho; documentar os limites em memória/processo único sem prometer proteção distribuída.
- Sem internet, o núcleo pode funcionar numa rede local adequada após instalação; YouTube e servidores ICE externos dependem desses serviços. Instalação e conectividade são requisitos distintos.
- TURN é configuração avançada opcional e pode gerar consumo de banda/custo para quem o operar. Nenhuma credencial permanente deve ser commitada.

## 8. UX e compatibilidade de produto

Preservar fundo claro, gradientes laranja/vermelho/magenta/roxo em pontos de marca, cartões arredondados, logo local e fontes sem CDN obrigatória. Não reabrir decisões visuais aprovadas sem necessidade de usabilidade ou pedido do proprietário.

Home continua com criação e entrada simples; ajustar o texto do código conforme V2-01. Não criar login, menu lateral, onboarding obrigatório ou pré-entrada como condição de lançamento. Escolha de dispositivos pode permanecer nos controles existentes.

Na sala, priorizar telas, manter duas telas equivalentes por padrão e câmeras independentes. Chat aberto, menus e teclado móvel não podem impedir microfone/câmera/tela/sair. Verificar safe areas, `playsinline`, foco visível, rótulos, contraste e redução de movimento sem redesenhar toda a interface.

Não declarar suporte a toda captura mobile. Informar indisponibilidade com clareza e restringir a matriz publicada ao que foi validado. Limites por navegador de arquivos, autoplay e YouTube precisam aparecer na documentação e na situação de erro correspondente.

## 9. Registro desta revisão
Plano reorientado em 23/10/2026 a partir do parecer de maturidade, da validação M10 e das decisões do proprietário. O objetivo passou de construir os recursos já existentes para concluir proteção de ingresso, regressão confiável, aceite integrado e preparação de release. A versão anterior foi preservada como histórico; nenhuma funcionalidade foi implementada ou reprovada automaticamente por esta revisão.

## 10. Pendências de decisão e trabalho futuro

| Tema | Tratamento |
| --- | --- |
| Entrada manual por fruta | Proposta de V2-01: fruta visual + código/link imprevisível. Se for essencial manter fruta como entrada, adotar aprovação explícita e documentar o fluxo antes de implementá-lo. |
| Navegadores e sistemas oficialmente suportados | Definir por evidências de V2-03/05; não presumir suporte universal. |
| Reconexão quando ambos caem | Caracterizar e formalizar em V2-04, preservando a regra atual enquanto não houver justificativa de mudança. |
| Tamanho de arquivo suportado | Publicar o que foi medido por navegador; separar do teto de oferta de 20 GiB. |
| Calibração adaptativa | Ajustar somente com medições/falhas; não inventar agressividade nova para cumprir marco. |
| Áudio da aba/sistema e controle remoto | Fora da 2.0; demandam pedido e análise próprios. |
| Logo SVG, otimização visual e novos módulos | Melhorias posteriores ou correções pontuais justificadas; não bloqueiam por preferência estética. |
| Ensaios TURN real | Opcionais, quando houver serviço disponível; manter suporte configurável existente. |

A numeração antiga M11 continua apenas como referência histórica de pesquisa de controle remoto, sem início automático após a 2.0.

## 11. Próximo pedido de execução sugerido

> Leia este plano e o parecer de maturidade. Execute somente V2-01 — Proteger convites e acesso às salas. Preserve a arquitetura, as fontes independentes, o limite de dois participantes, `npm start` e TURN opcional. Verifique a proposta de fruta como rótulo visual e código/link aleatório como credencial. Apresente o contrato de ingresso e a migração dos convites antigos antes de alterar os arquivos, sem pedir confirmação adicional para escolhas rotineiras dentro do escopo autorizado. Implemente a correção mínima, valide ingresso autorizado/recusado e descoberta por fruta em servidor isolado, e entregue evidências e limitações. Não execute V2-02 ou publique a versão automaticamente.

## 12. Definição de pronto da 2.0 estável

- [ ] Convite imprevisível/protegido, ingresso validado no servidor e descoberta por fruta sem acesso automático.
- [ ] Limite de dois, isolamento, ciclo de vida e teste anteriormente intermitente verificados consistentemente.
- [ ] Dois computadores nos navegadores declarados entram, usam microfone/câmera/tela independentemente e mantêm controle das fontes.
- [ ] Chat/notificações, arquivos com consentimento/integridade/cancelamento e YouTube sincronizado passam nos cenários suportados.
- [ ] Interface aprovada preservada, controles acessíveis e limitações mobile registradas.
- [ ] Sessão prolongada e falhas de rede caracterizadas, com métricas de mídia e instruções reais de recuperação.
- [ ] Instalação limpa, comandos, HTTPS/WSS e configuração opcional de ICE documentados e verificados.
- [ ] Nenhuma dependência pesada, banco, Docker, build ou serviço TURN obrigatório introduzido.
- [ ] Problemas críticos resolvidos; limitações restantes explícitas, sem convertê-las em aprovações fictícias.
- [ ] Candidata revisada, aceite do proprietário registrado, versão/lockfile/UI/notas coerentes em `2.0.0` e regressão final aprovada.

**Marco beta:** pode existir avaliação controlada antes desses aceites, identificada como beta e com riscos conhecidos comunicados. A classificação beta não autoriza divulgar convites previsíveis como privados nem publicar sem autorização.

**Marco estável:** só declarar quando os itens acima estiverem atendidos no escopo publicado. Ausência de TURN real não bloqueia o lançamento doméstico; falhas de acesso, integridade ou recursos prometidos bloqueiam.
