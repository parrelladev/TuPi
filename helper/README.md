# TuPi Remote Helper

Processo nativo auxiliar, **só Windows**, que recebe comandos de mouse e
teclado da aba do TuPi (via WebSocket local) e os executa de fato no sistema
usando [nut.js](https://github.com/nut-tree/nut.js). Sem ele, o controle
remoto do TuPi não tem como mexer no seu PC — o navegador não tem acesso a
isso por conta própria.

## Como rodar

1. Instale as dependências (só na primeira vez, ou dê duplo clique em
   `start-windows.bat`, que faz isso automaticamente):
   ```bash
   npm install
   ```
2. Inicie:
   ```bash
   npm start
   ```
   ou dê duplo clique em `start-windows.bat`.
3. No TuPi, em **Mais → Controle remoto**, compartilhe a tela inteira e ligue
   **"Permitir controle remoto"** — a aba conecta ao helper automaticamente,
   sem precisar copiar nada.

> Antes de instalar, confira no npm se `@nut-tree-fork/nut-js` ainda é o nome
> e a versão atual do fork mantido do nut.js — o pacote `robotjs` original
> está abandonado e não deve ser usado.

## Como funciona

- O helper escuta **só em `127.0.0.1`** — nenhuma outra máquina da rede
  consegue se conectar a ele. Essa é a única barreira de pareamento: não há
  token, porque qualquer processo que já consiga abrir esse socket já está
  rodando nesta mesma máquina.
- A aba do navegador só encaminha comandos de mouse/teclado depois que a
  pessoa que está sendo vista aceita um pedido de controle no TuPi — o
  helper em si não sabe nada sobre esse consentimento, só executa o que a
  aba já autorizou e repassou.

## Limitações conhecidas (v1)

- **Funciona bem só compartilhando a tela inteira** (não uma janela ou uma
  aba): a API de captura de tela do navegador não informa a posição real de
  uma janela/aba específica, então o mapeamento de coordenadas só é
  confiável com "Tela inteira".
- **Monitor primário apenas**: com múltiplos monitores, o helper controla o
  monitor principal do Windows.
- **Janelas elevadas ("Executar como administrador") não respondem** ao
  controle remoto, a menos que o próprio helper também rode elevado — é o
  comportamento esperado de segurança do Windows (UIPI), não um bug.
- Teclas de mídia, atalhos do sistema e entrada por IME complexo não são
  suportados.

## Parar o controle imediatamente

Fechar esta janela do console encerra o helper e corta o controle remoto na
hora, independentemente do que a aba do navegador pensa que está
acontecendo. Esse é o "botão de pânico" absoluto.
