# Inspeção e referência de latência — 27/10/2026

Estado: instrumentação preparada; chamada entre duas máquinas e ganho antes/depois **ainda não medidos**. Os temporizadores, buffers, processamento de voz e protocolos existentes foram mantidos. Não houve publicação em produção.

## Caminhos e esperas encontrados

| Caminho | Comportamento no código | Interpretação / hipótese a testar |
|---|---|---|
| Servidor | HTTP e WebSocket `/signal`; WebSocket encaminha SDP/ICE, não mídia | HTTP pelo endereço público mede o caminho navegador → Cloudflare (se presente) → origem → navegador. Não é latência da voz nem custo isolado do Cloudflare. |
| Voz enviada | `media.js`: captura mono preferencial, cancelamento de eco, redução de ruído e ganho automático no modo normal; track ligada ao sender | Processamento do navegador/dispositivo pode contribuir. Não há fila de áudio em JavaScript para envio. |
| Voz recebida | `voice.js`: MediaStream → ganho/conversão mono → compressor → MediaStreamDestination → elemento `voiceOut` | Há processamento e uma saída intermediária; candidato a comparação posterior com outra rota que preserve volume e seleção do alto-falante. `baseLatency`/`outputLatency` não medem toda essa rota. |
| Indicador de voz | Leitura a cada pelo menos 33 ms; FFT 512; suavização; sustentação de 320 ms | Afeta o indicador visual. Não equivale a segurar a fala por 320 ms. O tick também monta/atualiza a saída; throttling da aba pode afetar transições. |
| Chat | Canal `messages`, confiável e ordenado; envio imediato e inserção na UI no handler | Não há debounce de envio. Rede/SCTP e thread principal ainda podem atrasar. Som de notificação é assíncrono. |
| Arquivos compatíveis | Blocos de 64 KiB, SHA-256, ACK por bloco; leitura/hash/envio/ACK sequenciais | Vazão limitada pelo RTT mais verificação/escrita. Poll de 150 ms quando bloqueado; timeout de ACK de 30 s. |
| Arquivos rápidos | Blocos de 128 KiB, janela 16 (até 2 MiB de blocos sem ACK), ACK cumulativo a cada 4 blocos; limite de buffer 4 MiB | Canais separados compartilham a conexão e a rede. Testar disputa com mídia. Poll de 25 ms quando bloqueado; ACK acorda a espera imediatamente, fallback de 1 s não é atraso obrigatório. |
| Recepção de arquivos | `messageQueue` serializa hash e escrita; ACK vem depois da escrita | Disco/download via Service Worker pode segurar a janela do emissor. No fim, poll de buffer de 100 ms. Não confundir com atraso de cada mensagem de chat. |
| Download por SW | Preparação espera SW/download; escrita espera ACK do `MessagePort` | ACK do SW não comprova persistência física em disco. Caminho alternativo agrupa Blob a cada 32 MiB; fallback em memória limitado a 1 GiB. |
| Qualidade | `stats.js` amostra em 2 s; `quality.js` reduz após 3 amostras ruins e recupera após 8 boas; perda usada é cumulativa de vídeo | Reação exige várias amostras. Arquivos pausam enquanto `adaptiveLevel > 0`. Recuperação exige perda finita de vídeo: investigar chamada só com áudio/sem amostras de vídeo. |
| YouTube | Canal `control`, confiável e ordenado; comando explícito enviado imediatamente | Sem atraso deliberado antes do play/pause recebido; player pode estar carregando e manter apenas o último estado pendente. |
| YouTube periódico | Snapshot de 3 s; ping de relógio de 5 s; detecção de seek no player a cada 500 ms | Snapshot pode corrigir divergência depois. Ping estima offset supondo simetria; não comprova atraso exato em um sentido. |
| YouTube aplicação | Volume debounce de 60 ms; supressão de eco por 800 ms; correção de velocidade por 1,8 s; tolerância padrão 1 s | 800 ms suprime publicação de eventos do player, não espera para aplicar comandos. Timers sobrepostos podem encerrar a supressão cedo; testar ações rápidas antes de corrigir. |
| Reconexão | ICE após 5 s desconectado; aviso de perda após 12 s; signaling com backoff 1–15 s; reconnect aguarda fechamento até 1,5 s + 200 ms; app tem carência 5 s e retries 3/6/12 s | São tempos de recuperação, não latência contínua de mídia. |

## Como coletar a referência

1. Executar esta versão nas duas máquinas. Abrir o endereço habitual com `?diagnostics=1` **antes de entrar na chamada**, nas duas pontas. Se já existir query string, acrescentar `&diagnostics=1`. Usar o endereço público para incluir Cloudflare; localhost não reproduz esse caminho.
2. Abrir o painel “Diagnóstico temporário” no canto inferior esquerdo e clicar **Iniciar** nas duas máquinas. Ele não começa automaticamente. A pessoa que inicia a conexão cria um canal de diagnóstico confiável/ordenado; ambos precisam desta versão e da opção ativada.
3. Manter navegador, rede, dispositivos, volume, modo de áudio e configurações de tela iguais nas repetições. Anotar essas condições separadamente, sem dados pessoais. Manter abas visíveis e fechar o painel para não cobrir os controles.
4. Fazer quatro cenários, selecionando o cenário nos dois painéis: **Só voz**, **Voz + tela**, **Voz + arquivo**, **YouTube**. Sugestão: 2 minutos cada, após 15 s de aquecimento antes de iniciar. Desligar a câmera; encerrar a tela antes do cenário de arquivo para isolar a variável. Usar o mesmo arquivo e modo nas repetições, grande o suficiente para ocupar o cenário. O TuPi encerra tela ao abrir YouTube.
5. Em cada cenário, conversar e enviar algumas mensagens curtas. No YouTube, após o player pronto nos dois lados, alternar play/pause/seek primeiro de uma ponta e depois da outra, com alguns segundos entre ações. Fazer um pequeno bloco adicional de ações rápidas para verificar supressão/conflitos; repetir a mesma sequência depois.
6. Quando perceber corte, clicar **Marcar corte de áudio**; quando um comando não surtir efeito, **Marcar comando sem efeito**. Esses marcadores são observações humanas, sem gravação.
7. Ao terminar, aguardar cerca de 10 s para respostas pendentes, clicar **Parar** e **Exportar JSON** nas duas pontas. Guardar os arquivos como referência A e B. Recarregar a página antes de uma nova execução para começar um registro vazio.

Dados ficam apenas em memória até exportar. Não são enviados para análise no servidor. A sonda transmite apenas tipo e contador; HTTP não transporta registros. Não são coletados texto do chat, áudio, vídeo, URL/ID do YouTube, nome/conteúdo/hash de arquivo, SDP, endereços IP, nomes ou IDs de dispositivos. O limite é 20 mil registros; `dropped > 0` indica referência incompleta. Filas de arquivos são agregadas a cada 2 s para limitar o custo de coleta.

## Métricas e limites

### Atualização `latency-baseline-2`

O painel agora informa se a outra ponta responde, está com a coleta parada, ficou sem responder por mais de 10 s ou se o canal está indisponível/congestionado. O estado aparece também no JSON (`probe-status`) e no resumo (`diagnosticStates`). Para identificar explicitamente coleta parada, as duas máquinas precisam desta versão. Versões antigas que ficam em silêncio continuam aparecendo como ausência de resposta, sem atribuir a causa à rede.

Com a opção `diagnostics=1` ativa, uma coleta parada responde a pings com um pequeno aviso de estado, limitado a quatro respostas por segundo; não inicia coleta nem sondas e não produz amostra de RTT. Sem a opção, não responde. A medição continua exigindo Iniciar nas duas pontas.

`audio-availability` registra o motivo da ausência: conexão ainda indisponível, falha ao consultar estatísticas, nenhum RTP recebido, RTP sem identificação de mídia ou RTP recebido sem áudio. Quando há áudio, registra quais campos o navegador forneceu. A classificação também usa o codec quando `kind`/`mediaType` não estão presentes. O registro inclui direção negociada e estados dos receptores de áudio, sem IDs ou nomes das tracks; `capture` distingue stream/track ausente de latência de captura não informada. Esses indícios não comprovam isoladamente ausência de som. Nenhuma mudança foi feita na captura, reprodução ou nos buffers de áudio.

- `http.headersMs` e `totalMs`: tempo local até cabeçalhos e fim da resposta 204, a cada 10 s, sem cache. `cloudflare` indica presença do cabeçalho `cf-ray`; não separa DNS/TLS, proxy, rede e origem. Verificar status 204 e cache não HIT. Erros/timeout aparecem separadamente.
- `peer-rtt.ms`: ping/pong pequeno no canal diagnóstico a cada 2 s, cronometrado com `performance.now()` na ponta que enviou. Inclui filas, transporte e execução dos handlers. Não depende de sincronização dos relógios. Não dividir por dois e chamar o resultado de atraso exato em um sentido. Canal próprio não mede diretamente a fila interna de `messages`/`control`.
- `probe-timeout`: não houve resposta em mais de 10 s; pode ser congestionamento, aba suspensa, diagnóstico parado na outra ponta ou desconexão. Não é comprovação de pacote perdido. `probe-interrupted` registra sondas pendentes ao parar/reconectar; `probe-unavailable` indica canal indisponível.
- `chat-applied.ms`: entrada no handler até inserção/atualização da UI. Não inclui entrega na rede nem pintura do próximo frame.
- `youtube-api-applied.ms`: recepção de comando válido até chamar a API do player, incluindo espera em `pendingState`. Não comprova que som/imagem já mudou. `youtube-player-state` registra eventos independentes do player; não há associação inequívoca entre cada comando e frame reproduzido. Comandos antigos e estados pendentes substituídos têm contadores próprios. Tentativas de envio não são ACKs de entrega.
- `audio`: por stream (`mid`, normalmente microfone e áudio da tela separados), jitter instantâneo e diferenças entre amostras de buffer, pacotes, ocultação de perdas e ajustes de amostras. Média de buffer = diferença de `jitterBufferDelay` / diferença de `jitterBufferEmittedCount`; não usar razão cumulativa da chamada. Campos ausentes ou sem delta válido ficam `null`, não zero. Contadores de ocultação não equivalem automaticamente a cortes audíveis.
- `audio-context` e `capture`: latências disponíveis do contexto/captura, estado suspenso/bloqueado e opções de processamento. Não são uma medição acústica boca → ouvido. Não somar cegamente métricas sobrepostas.
- `buffers`: bytes aguardando envio por canal, protocolo ativo de arquivo, nível adaptativo, tela/câmera. `file-handlers`: contagem, soma e máximo de espera na fila e processamento por janela de coleta. P95 dos máximos de janela não é p95 por bloco.
- `scheduler.lateMs` e `hidden`: atraso do timer e visibilidade para identificar interferência da thread principal/aba em segundo plano. Estados de conexão registram instabilidade.

## Relatório antes/depois

Gerar resumo (cada arquivo permanece separado):

```powershell
node scripts/summarize-diagnostics.js antes-A.json depois-A.json > comparacao-A.json
node scripts/summarize-diagnostics.js antes-B.json depois-B.json > comparacao-B.json
```

O resumo contém n, mediana (percentil por posto), p95 e máximo por cenário/métrica/stream, contagem de eventos e somas de perdas/ocultação. Comparar amostras de duração semelhante e taxas normalizadas por pacotes/amostras; não comparar contagens brutas de chamadas de durações diferentes. Poucos comandos não dão p95 estável. O script não conclui causalidade nem mistura as duas pontas.

| Resultado | Referência | Após correção | Ganho |
|---|---|---|---|
| HTTP público, RTT P2P, buffer/jitter de áudio, aplicação YouTube, fila de arquivos | A coletar | A coletar | Não medido |
| Cortes percebidos, ocultação, comandos sem efeito, desconexões | A coletar | A coletar | Não medido |

Após os registros: priorizar correção conforme a correlação observada; alterar uma hipótese por vez; repetir os quatro cenários e rejeitar ganho que venha com mais cortes, falhas de comando ou instabilidade. Candidatos: saída Web Audio intermediária, buffers/polling de arquivos, recuperação adaptativa baseada em perda de vídeo, supressão de eventos e estado pendente do YouTube. Nenhum foi tratado como causa comprovada nesta etapa.

## Validação e remoção

Testes locais verificam cálculo por delta, RTT sem relógio remoto, cenários, descarte de pong não solicitado, limites de memória, agregação e endpoint sem cache. A suíte de servidor verifica também disponibilidade do módulo no precache. Isso não substitui uma chamada real nem valida visualmente o painel em todos os navegadores.

Sem `diagnostics=1`, não há painel, coleta, timers de diagnóstico, sondas HTTP ou novo canal. Para encerrar a coleta usar Parar; para desativar por completo, remover o parâmetro e recarregar. Remoção definitiva: retirar módulo/imports/hooks, endpoint e sua entrada no mapa estático, precache, estilos e scripts/testes específicos.
