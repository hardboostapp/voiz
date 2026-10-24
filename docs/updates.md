# Atualizações pelo GitHub

O Voiz consulta `hardboostapp/voiz` somente quando o usuário clica em **Buscar atualização**. A API de Releases fornece a versão estável e o SHA-256 do asset. Não há credenciais de GitHub no aplicativo nem telemetria. O motor de voz continua local.

## Formato

O asset `Voiz-X.Y.Z-update.json` contém schema 1, produto `voiz`, versão e arquivos da pasta `app`, codificados em base64 com SHA-256 individual. O cliente confere o tamanho, o digest do GitHub, os hashes, caminhos relativos sem travessia, duplicação de nomes, arquivos essenciais e a versão do package.json. O limite é 8 MiB. Falta de digest, erro de rede ou pacote inválido impede a instalação.

O formato inclui somente o aplicativo e evita extratores de arquivo ou dependências adicionais. As versões são comparadas numericamente; versões iguais, anteriores, rascunhos e prévias não são instalados.

## Instalação

O download fica em `updates/<UUID>/app`. Ao clicar em **Reiniciar e atualizar**, o áudio para e um helper PowerShell local valida o destino e sinaliza que está pronto. Só então o Voiz encerra seu motor e fecha. O helper aguarda o processo sair, move `app` para `updates/<UUID>/previous-app`, move o novo app para o lugar e reabre o Electron existente. Falha durante a troca restaura a pasta anterior. `updates/last-result.json` registra o resultado e a localização do backup.

Essa troca substitui apenas `app`, preservando dados, perfis e projetos vizinhos. Ao iniciar o aplicativo atualizado, o catálogo `app/resources.json` confere e instala os recursos fornecidos que estiverem novos ou faltando. O runtime Electron continua sendo o existente; o Setup oferece sua instalação independente e a instalação do driver.

A versão 0.4.6 leva um iniciador Windows pequeno no manifesto `app/launcher.json`, com tamanho e SHA-256. Na próxima abertura, `launcher.cjs` materializa `Voiz.exe` na raiz da instalação e salva apenas o caminho local do runtime em `settings/launcher-runtime.txt`. O código-fonte do iniciador está em `setup/VoizLauncher.cs`; `node scripts/build-launcher.cjs` regenera o manifesto com o compilador .NET Framework do Windows e o ícone do aplicativo. O iniciador possui os metadados Voiz/hardboostapp, encaminha os argumentos para o Electron existente e não abre console. A migração altera somente a entrada de inicialização Voiz, preservando inclusive a desativação feita no Windows; não ativa a opção para quem nunca a registrou. O protocolo de atualização continua aceitando somente as extensões existentes, sem adicionar executáveis arbitrários ao pacote.

A versão 0.4.7 acrescenta `monitorMode`: `windows` acompanha a saída padrão do Windows; `device` mantém o fone salvo em `monitorName`. Bibliotecas anteriores com um fone salvo migram para `device`, sem substituir a seleção. O retorno usa o sink padrão nativo e resolve o alias `default` para evitar duplicação quando a saída principal já é o mesmo dispositivo. Mudanças no padrão atualizam somente o retorno, preservando o envio à chamada. Cabos virtuais continuam fora do retorno local. Os atalhos existentes cujo destino e argumentos pertencem a esta instalação são atualizados para `Voiz.exe` com `hardboostapp.voiz`; links ausentes ou pertencentes a outro app não são recriados nem alterados. A janela também declara nome, ícone e comando de reabertura próprios para o Windows. Blocos antigos fixados no Iniciar podem precisar ser desafixados e fixados novamente pelo usuário.

## Motor e vozes fornecidos

O catálogo fixa URLs públicas de assets em `hardboostapp/voiz`, tamanhos e SHA-256 do ZIP e de cada arquivo. O instalador baixa cerca de 2,2 GB na primeira execução. Os pacotes contêm o motor, módulos, modelos ONNX prontos e índices de Lula, Bolsonaro, Mano Brown e Feminina, com suas atribuições. O pacote base original VB-CABLE acompanha o Setup. Uma nova voz fornecida deve ser incluída no catálogo e no manifesto da próxima versão do aplicativo; assim chega às outras instalações depois da atualização, sem importação manual.

Os caminhos gerenciados se limitam aos arquivos declarados do motor, slots de modelos e driver. O extrator rejeita travessia, nomes duplicados, arquivos extras e destinos com junctions. Cada arquivo é verificado antes da substituição; arquivos anteriores ficam em `updates/resources-previous`. Links físicos são substituídos por renomeação, preservando a origem. Sons particulares, biblioteca, ajustes por voz e modelos fora dos caminhos gerenciados não são publicados nem substituídos. O recibo em `data/installed-resources.json` evita conferir novamente todos os pesos a cada abertura; ausência ou mudança de tamanho provoca recuperação. Configurações pequenas podem ser atualizadas sem baixar novamente o modelo inteiro.

O progresso mostra o pacote e os MB recebidos. Falha oferece nova tentativa. Downloads concluídos são reaproveitados; downloads parciais podem recomeçar. A preparação não captura microfone nem executa exportação ONNX no PC de destino. As bibliotecas PyInstaller são extraídas uma vez em `engine-runtime/<hash>`; o motor não gera uma nova cópia temporária a cada abertura.

Para recuperação manual, feche o Voiz, preserve a pasta `app` atual com outro nome e copie `previous-app` indicada no relatório para `app`. As cópias de recuperação não são apagadas automaticamente.

## Publicação

A consulta automática ocorre ao iniciar e nos eventos de foco, restauração e maximização, com intervalo mínimo de cinco minutos e bloqueio de concorrência. Uma atualização baixada e pronta para instalar é preservada. A consulta não baixa, instala, reinicia ou abre o microfone automaticamente. O resultado aparece na engrenagem de Configurações e na seção Atualizações. Os controles manuais continuam disponíveis nessa seção.

1. Aumentar a versão em `app/package.json`.
2. Executar os testes e revisar somente os arquivos permitidos por `.gitignore`.
3. Enviar a revisão à branch main, criar a tag correspondente `vX.Y.Z` ou executar o workflow manualmente. O envio de alterações no app à main já inicia a publicação; use uma versão nova a cada publicação.
4. Aguardar o workflow de publicação no GitHub Actions. Ele monta o pacote e cria uma Release estável; não reutiliza versões existentes.

O checksum garante integridade do transporte conforme os dados publicados no GitHub; não é assinatura de código independente. A confiança continua na conta e no repositório configurados. Não existe chave privada ou token de publicação embutido no pacote.

## Primeiro instalador

O Setup instala em `%LOCALAPPDATA%\Programs\Voiz`, cria atalhos, baixa o motor e as quatro vozes prontas e chama o instalador VB-CABLE original. Requer internet e 6 GB livres. O driver é verificado por SHA-256 e assinatura Authenticode do fabricante antes de pedir elevação ao Windows. Não importa certificados nem ignora confirmações do sistema. Se já houver dispositivo VB-Audio saudável, não reinstala. Uma instalação nova pode pedir reinicialização. O VB-CABLE é donationware; o crédito e o link de contribuição ao fabricante aparecem no instalador e no aplicativo.

O modo silencioso também prepara os recursos. Somente o modo explícito de teste `/S /NOINTEGRATION=1 /D=<pasta temporária>` instala a base sem downloads, atalhos, registro ou driver. A desinstalação preserva a biblioteca e os modelos e não remove o cabo compartilhado com outros programas.

O motor começa no modo client com todos os dispositivos de áudio em -1. **Preparar vozes.cmd** é a recuperação manual para concluir recursos, com o Voiz fechado pela bandeja. A interface também permite tentar novamente quando a preparação automática falha.
