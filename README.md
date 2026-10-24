# Voiz

Soundboard e transformação de voz ao vivo para Windows, com interface Electron em português brasileiro.

Importe sons, organize favoritos, configure atalhos e misture o soundboard com a voz natural ou os modelos RVC locais. O microfone só abre após ativação explícita.

## Baixar e compartilhar

Abra [a versão mais recente](https://github.com/hardboostapp/voiz/releases/latest) e baixe o arquivo **Voiz-X.Y.Z-Setup.exe**. Esse é o link para compartilhar com amigos. O instalador para Windows 10/11 de 64 bits inclui Electron; cada pessoa terá sua própria biblioteca, atalhos e configurações locais.

O instalador baixa automaticamente o motor e as quatro vozes prontas: **Lula, Bolsonaro, Mano Brown e Feminina**. Cada download mostra o progresso e tem SHA-256 conferido. A primeira instalação usa cerca de **2,2 GB de internet** e requer **6 GB livres** durante a preparação. Os modelos já vêm convertidos para ONNX: o PC de quem instala não precisa exportá-los. Se a rede falhar, escolha tentar novamente; os pacotes concluídos são reaproveitados. **Preparar vozes.cmd**, na pasta instalada, também permite concluir a preparação.

O mesmo instalador inclui e inicia a instalação do cabo virtual **VB-CABLE**, da [VB-Audio](https://vb-audio.com/Cable/). Autorize a confirmação do Windows e reinicie o PC se solicitado. Não é necessário procurar arquivos em Downloads. O VB-CABLE é donationware; todas as contribuições ao fabricante são bem-vindas pelo site oficial. A distribuição do pacote base acompanha a [permissão de integração do fabricante](https://vb-audio.com/Services/licensing.htm).

## Atualizações

O Voiz busca atualizações ao abrir e quando você volta à janela ou a maximiza, respeitando um intervalo de cinco minutos entre consultas. Uma marca na engrenagem indica quando há uma versão nova. Abra **Configurações → Atualizações**, baixe o pacote e clique em **Reiniciar e atualizar**. A busca manual também fica nessa seção. O aplicativo consulta exclusivamente as versões estáveis deste repositório, verifica SHA-256 e conserva uma cópia do aplicativo anterior.

Após atualizar o aplicativo, o catálogo instala automaticamente as vozes fornecidas que estiverem novas ou faltando. Sons, atalhos, ajustes por voz, modelos adicionados pelo usuário e dados pessoais são preservados. As versões anteriores dos arquivos gerenciados substituídos ficam em `updates/resources-previous`. O código público não contém dados da instalação pessoal; os pesos fornecidos são assets separados de Releases.

## Requisitos da instalação atual

O instalador fornece Electron 44, motor VCClient, bibliotecas, modelos e instalador do cabo virtual. Também é mantida a compatibilidade com a instalação anterior que reutiliza ferramentas vizinhas. O motor escuta somente em loopback e o envio para chamadas usa VB-CABLE. O arquivo **update.json** serve para atualizar uma instalação existente; use o **Setup.exe** para instalar em outro PC.

No Voiz, selecione **CABLE Input** como saída. No Discord ou outro aplicativo, selecione **CABLE Output** como entrada e mantenha os fones como saída.

No Soundboard, mantenha **Ouvir meus sons** ligado e escolha o fone em **Ouvir em**. Os sons disparados por clique ou atalho também são reproduzidos nesse dispositivo. Para escutar também a voz escolhida, marque **Ouvir minha voz**, abaixo do botão do microfone, e ative o microfone. Os dois retornos podem ser ligados separadamente. Usar o mesmo dispositivo nas duas saídas não duplica a reprodução.

Em **Ouvir em → Padrão do Windows**, o retorno acompanha a saída de áudio padrão do sistema, inclusive ao trocar de fone. A escolha fica salva. Instalações novas usam essa opção; quem já escolheu um fone manualmente mantém sua seleção. Se o padrão do Windows for um cabo virtual, escolha um fone físico no Windows ou no Voiz para ouvir o retorno.

Para experimentar um efeito em particular, desligue **Enviar sons para a call** e mantenha **Ouvir meus sons** ligado. Cliques e atalhos passam a tocar somente no seu fone. Sua voz continua sendo enviada normalmente. Ligue novamente **Enviar sons para a call** quando quiser compartilhar os efeitos. As duas preferências ficam salvas.

Cada quadradinho de som tem um botão de teclado para **Adicionar ou alterar atalho**. Clique e pressione a combinação: ela é salva imediatamente, sem abrir o formulário de edição. Use **Cancelar** ou Escape para sair e **Remover atalho** para limpar. Combinações em uso por outro som são recusadas.

Em **Windows e bandeja**, marque **Iniciar com o Windows** para abrir o Voiz na bandeja ao entrar na sua conta. O microfone começa desligado. O botão **X** recolhe a janela e mantém o áudio e os atalhos funcionando. Para encerrar, clique com o botão direito no ícone da bandeja e escolha **Sair do Voiz**; esse menu também oferece **Parar tudo**.

A engrenagem no canto superior direito reúne **Atualizações**, **Windows e bandeja**, **Usar no Discord**, atribuições e logs. Esses itens ficam fora do painel principal de voz e sons.

Desde a versão 0.4.6, a inicialização usa **Voiz.exe**, um iniciador de 12 KB com nome e ícone próprios, em vez de mostrar a identidade genérica do Electron no Windows. Entradas antigas são migradas mantendo a preferência de iniciar ou permanecer desativado. O runtime existente é reaproveitado. Se a lista de inicialização estiver aberta durante a migração, feche e reabra essa página para atualizá-la.

A versão 0.4.7 também atualiza os atalhos existentes do Voiz para esse iniciador, com ícone e identidade próprios no Windows. Se um bloco antigo do menu Iniciar ainda mostrar Electron, desafixe esse bloco e fixe novamente o **Voiz** encontrado na pesquisa após abrir a versão atualizada.

A reprodução da voz de IA começa com reserva de 100 ms e aumenta até 200 ms se faltar áudio convertido. Isso reduz a espera inicial em 100 ms em relação à versão 0.4.1; a latência total também inclui captura, conversão, dispositivos e aplicativo da chamada.

Escolher uma voz já inicia sua preparação em segundo plano, mantendo o microfone desligado. Ao ativar a mesma voz, o aplicativo reaproveita essa preparação. O motor usa uma única cópia persistente de suas bibliotecas, de aproximadamente 959 MiB, e seu cliente auxiliar permanece sem janela. Os padrões de influência do modelo e proteção de consoantes foram ajustados para reduzir trocas de palavras e artefatos. A conversão ainda pode alterar pronúncia e timbre. A opção **Feminina** usa o modelo comunitário **Nilce Moretto**, com ajuste de tom em **Ajustar voz**; a equivalência exata com demonstrações de outros serviços não foi confirmada.

## Desenvolvimento e publicação

Use Node.js 22 ou superior:

```powershell
node --test tests/*.test.cjs
node scripts/build-release.cjs
node scripts/build-installer.cjs
```

O compilador do instalador usa NSIS em Windows; configure `VOIZ_MAKENSIS` com o executável do compilador e, opcionalmente, `VOIZ_ELECTRON_DIR` com a distribuição oficial completa do Electron 44. Sem um runtime local, o script baixa a versão fixada e confere SHA-256.

Para publicar, aumente `app/package.json` e envie os arquivos revisados à branch main ou crie uma tag `vX.Y.Z`. O GitHub Actions testa e publica o **Setup.exe**, o pacote **update.json** e os checksums em Releases. Todos consultam o mesmo canal público, sem login; a aplicação da atualização depende da confirmação dentro do Voiz. Para fornecer outra voz, revise sua licença, acrescente-a ao catálogo e publique o pacote fixado por hash junto com uma nova versão do aplicativo. Consulte [o protocolo e os testes de atualização](docs/updates.md).

## Modelos e atribuição

As opções usam modelos de imitação por IA, sem vínculo oficial com as pessoas retratadas. Os pacotes de Releases contêm conversões locais para ONNX e índices das origens abaixo; preserve suas atribuições e condições de uso:

- Lula: [Ivan198542/rvcmodels](https://huggingface.co/Ivan198542/rvcmodels), [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), uso não comercial.
- Bolsonaro: LH6582 / [Ivan198542/rvcmodels](https://huggingface.co/Ivan198542/rvcmodels), CC BY-NC 4.0 declarada na origem utilizada, uso não comercial.
- Mano Brown: [vitor007009/Mano_Brown](https://huggingface.co/vitor007009/Mano_Brown), OpenRAIL declarada na origem.
- Feminina / Nilce Moretto: [BunnyToon/nilce, revisão fixada](https://huggingface.co/BunnyToon/nilce/tree/f8d89fa370c8ba2edb2f399244a4f1234342c12e), OpenRAIL declarada na origem. Substitui o modelo genérico em inglês desde a versão 0.4.5. A naturalidade depende da entrada; esta versão não incorpora referências privadas.

Motor: [w-okada/voice-changer](https://github.com/w-okada/voice-changer), licença incluída em `engine/licenses`. Electron e Chromium acompanham suas licenças. O driver VB-CABLE conserva os arquivos originais e o aviso da VB-Audio.
