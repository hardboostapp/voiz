# Voiz

Soundboard e transformação de voz ao vivo para Windows, com interface Electron em português brasileiro.

Importe sons, organize favoritos, configure atalhos e misture o soundboard com a voz natural ou os modelos RVC locais. O microfone só abre após ativação explícita.

## Atualizações

Na instalação existente, clique em **Atualizações → Buscar atualização**. Quando houver uma versão nova, baixe o pacote e clique em **Reiniciar e atualizar**. O aplicativo consulta exclusivamente as versões estáveis deste repositório, verifica SHA-256 e conserva uma cópia do aplicativo anterior.

Sons, modelos, biblioteca, configurações do motor e perfis do Electron ficam fora do pacote e são preservados. Este repositório não contém gravações, pesos dos modelos nem dados da instalação pessoal.

## Requisitos da instalação atual

Windows, Electron 44 e o motor VCClient já provisionados localmente. O pacote desta versão atualiza a interface e sua integração; não é um instalador completo para um PC novo. A instalação existente usa o runtime Electron vizinho e o VCClient com configurações próprias, em loopback. O envio para chamadas usa VB-CABLE.

No Voiz, selecione **CABLE Input** como saída. No Discord ou outro aplicativo, selecione **CABLE Output** como entrada e mantenha os fones como saída.

No Soundboard, mantenha **Ouvir meus sons** ligado e escolha o fone em **Ouvir em**. Os sons disparados por clique ou atalho também são reproduzidos nesse dispositivo. Para escutar também a voz escolhida, marque **Ouvir minha voz**, abaixo do botão do microfone, e ative o microfone. Os dois retornos podem ser ligados separadamente. Usar o mesmo dispositivo nas duas saídas não duplica a reprodução.

Em **Windows e bandeja**, marque **Iniciar com o Windows** para abrir o Voiz na bandeja ao entrar na sua conta. O microfone começa desligado. O botão **X** recolhe a janela e mantém o áudio e os atalhos funcionando. Para encerrar, clique com o botão direito no ícone da bandeja e escolha **Sair do Voiz**; esse menu também oferece **Parar tudo**.

A reprodução da voz de IA começa com reserva de 100 ms e aumenta até 200 ms se faltar áudio convertido. Isso reduz a espera inicial em 100 ms em relação à versão 0.4.1; a latência total também inclui captura, conversão, dispositivos e aplicativo da chamada.

## Desenvolvimento e publicação

Use Node.js 22 ou superior:

```powershell
node --test tests/*.test.cjs
node scripts/build-release.cjs
```

Para publicar, aumente `app/package.json`, envie os arquivos revisados e crie uma tag `vX.Y.Z`. O GitHub Actions testa e publica `Voiz-X.Y.Z-update.json` em Releases. Também é possível executar o workflow manualmente na aba Actions. Consulte [o protocolo e os testes de atualização](docs/updates.md).

## Modelos e atribuição

As opções de voz utilizam modelos de imitação por IA, sem vínculo oficial. Os modelos são externos a este repositório e não são redistribuídos aqui. Lula: Ivan198542, CC BY-NC 4.0 declarada; Bolsonaro: LH6582 / Ivan198542; Mano Brown: vitor007009. A opção Feminina usa [Wismut/RVC_US_Female_1](https://huggingface.co/Wismut/RVC_US_Female_1), Apache-2.0 declarada na origem; o modelo original é em inglês e foi ensaiado localmente com fala sintetizada em português. A naturalidade percebida depende da entrada e precisa de avaliação de escuta. Preserve as atribuições e licenças da origem ao instalar modelos. Motor: [w-okada/voice-changer](https://github.com/w-okada/voice-changer).
