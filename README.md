# Voiz

Soundboard e transformação de voz ao vivo para Windows, com interface Electron em português brasileiro.

Importe sons, organize favoritos, configure atalhos e misture o soundboard com a voz natural ou os modelos RVC locais. O microfone só abre após ativação explícita.

## Baixar e compartilhar

Abra [a versão mais recente](https://github.com/hardboostapp/voiz/releases/latest) e baixe o arquivo **Voiz-X.Y.Z-Setup.exe**. Esse é o link para compartilhar com amigos. O instalador para Windows 10/11 de 64 bits inclui Electron; cada pessoa terá sua própria biblioteca, atalhos e configurações locais.

Na instalação, a opção **Preparar Lula, Bolsonaro e Mano Brown** baixa o motor e os modelos diretamente das origens, confere SHA-256 e converte os modelos para ONNX. Exige internet e pelo menos 5 GB livres durante a preparação. Se a rede falhar, termine a instalação da base e execute **Preparar vozes.cmd** na pasta instalada. Soundboard e voz Natural funcionam sem os modelos de IA.

Para enviar áudio às chamadas, instale também o driver [VB-CABLE pelo site oficial](https://vb-audio.com/Cable/). O botão do Voiz abre o instalador local quando disponível, ou a página oficial para download. O driver pode exigir autorização do Windows e reinicialização.

## Atualizações

Na instalação existente, clique em **Atualizações → Buscar atualização**. Quando houver uma versão nova, baixe o pacote e clique em **Reiniciar e atualizar**. O aplicativo consulta exclusivamente as versões estáveis deste repositório, verifica SHA-256 e conserva uma cópia do aplicativo anterior.

Sons, modelos, biblioteca, configurações do motor e perfis do Electron ficam fora do pacote e são preservados. Este repositório não contém gravações, pesos dos modelos nem dados da instalação pessoal.

## Requisitos da instalação atual

O instalador independente fornece seu próprio Electron 44 e uma preparação opcional para o motor VCClient. Também é mantida a compatibilidade com a instalação anterior que reutiliza ferramentas vizinhas. O motor escuta somente em loopback e o envio para chamadas usa VB-CABLE. O arquivo **update.json** serve para atualizar uma instalação existente; use o **Setup.exe** para instalar em outro PC.

No Voiz, selecione **CABLE Input** como saída. No Discord ou outro aplicativo, selecione **CABLE Output** como entrada e mantenha os fones como saída.

No Soundboard, mantenha **Ouvir meus sons** ligado e escolha o fone em **Ouvir em**. Os sons disparados por clique ou atalho também são reproduzidos nesse dispositivo. Para escutar também a voz escolhida, marque **Ouvir minha voz**, abaixo do botão do microfone, e ative o microfone. Os dois retornos podem ser ligados separadamente. Usar o mesmo dispositivo nas duas saídas não duplica a reprodução.

Em **Windows e bandeja**, marque **Iniciar com o Windows** para abrir o Voiz na bandeja ao entrar na sua conta. O microfone começa desligado. O botão **X** recolhe a janela e mantém o áudio e os atalhos funcionando. Para encerrar, clique com o botão direito no ícone da bandeja e escolha **Sair do Voiz**; esse menu também oferece **Parar tudo**.

A reprodução da voz de IA começa com reserva de 100 ms e aumenta até 200 ms se faltar áudio convertido. Isso reduz a espera inicial em 100 ms em relação à versão 0.4.1; a latência total também inclui captura, conversão, dispositivos e aplicativo da chamada.

## Desenvolvimento e publicação

Use Node.js 22 ou superior:

```powershell
node --test tests/*.test.cjs
node scripts/build-release.cjs
node scripts/build-installer.cjs
```

O compilador do instalador usa NSIS em Windows; configure `VOIZ_MAKENSIS` com o executável do compilador e, opcionalmente, `VOIZ_ELECTRON_DIR` com a distribuição oficial completa do Electron 44. Sem um runtime local, o script baixa a versão fixada e confere SHA-256.

Para publicar, aumente `app/package.json` e envie os arquivos revisados à branch main ou crie uma tag `vX.Y.Z`. O GitHub Actions testa e publica o **Setup.exe**, o pacote **update.json** e os checksums em Releases. Todos os usuários consultam esse mesmo canal público, sem login; a instalação da atualização depende da confirmação dentro do Voiz. Sons, modelos e ajustes de cada pessoa são preservados. Também é possível executar o workflow manualmente na aba Actions. Consulte [o protocolo e os testes de atualização](docs/updates.md).

## Modelos e atribuição

As opções de voz utilizam modelos de imitação por IA, sem vínculo oficial. Os modelos são externos a este repositório e não são redistribuídos aqui. Lula: Ivan198542, CC BY-NC 4.0 declarada; Bolsonaro: LH6582 / Ivan198542; Mano Brown: vitor007009. A opção Feminina usa [Wismut/RVC_US_Female_1](https://huggingface.co/Wismut/RVC_US_Female_1), Apache-2.0 declarada na origem; o modelo original é em inglês e foi ensaiado localmente com fala sintetizada em português. A naturalidade percebida depende da entrada e precisa de avaliação de escuta. Preserve as atribuições e licenças da origem ao instalar modelos. Motor: [w-okada/voice-changer](https://github.com/w-okada/voice-changer).
