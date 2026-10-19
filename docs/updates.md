# Atualizações pelo GitHub

O Voiz consulta `hardboostapp/voiz` somente quando o usuário clica em **Buscar atualização**. A API de Releases fornece a versão estável e o SHA-256 do asset. Não há credenciais de GitHub no aplicativo nem telemetria. O motor de voz continua local.

## Formato

O asset `Voiz-X.Y.Z-update.json` contém schema 1, produto `voiz`, versão e arquivos da pasta `app`, codificados em base64 com SHA-256 individual. O cliente confere o tamanho, o digest do GitHub, os hashes, caminhos relativos sem travessia, duplicação de nomes, arquivos essenciais e a versão do package.json. O limite é 8 MiB. Falta de digest, erro de rede ou pacote inválido impede a instalação.

O formato inclui somente o aplicativo e evita extratores de arquivo ou dependências adicionais. As versões são comparadas numericamente; versões iguais, anteriores, rascunhos e prévias não são instalados.

## Instalação

O download fica em `updates/<UUID>/app`. Ao clicar em **Reiniciar e atualizar**, o áudio para e um helper PowerShell local valida o destino e sinaliza que está pronto. Só então o Voiz encerra seu motor e fecha. O helper aguarda o processo sair, move `app` para `updates/<UUID>/previous-app`, move o novo app para o lugar e reabre o Electron existente. Falha durante a troca restaura a pasta anterior. `updates/last-result.json` registra o resultado e a localização do backup.

Não são atualizados `data`, `models`, `engine`, `logs`, `electron-profile`, o runtime Electron, o driver VB-CABLE ou os projetos vizinhos. Para a primeira instalação, a Release também oferece `Voiz-X.Y.Z-Setup.exe`, que inclui seu próprio Electron e permite preparar o motor e as vozes a partir das origens fixadas em `setup/downloads.json`. O VB-CABLE é instalado separadamente pelo site oficial.

Para recuperação manual, feche o Voiz, preserve a pasta `app` atual com outro nome e copie `previous-app` indicada no relatório para `app`. As cópias de recuperação não são apagadas automaticamente.

## Publicação

1. Aumentar a versão em `app/package.json`.
2. Executar os testes e revisar somente os arquivos permitidos por `.gitignore`.
3. Enviar a revisão à branch main, criar a tag correspondente `vX.Y.Z` ou executar o workflow manualmente. O envio de alterações no app à main já inicia a publicação; use uma versão nova a cada publicação.
4. Aguardar o workflow de publicação no GitHub Actions. Ele monta o pacote e cria uma Release estável; não reutiliza versões existentes.

O checksum garante integridade do transporte conforme os dados publicados no GitHub; não é assinatura de código independente. A confiança continua na conta e no repositório configurados. Não existe chave privada ou token de publicação embutido no pacote.

## Primeiro instalador

O Setup instala a base em `%LOCALAPPDATA%\Programs\Voiz`, cria atalhos e oferece a preparação das três vozes. Não inclui modelos, sons ou referências do computador de desenvolvimento. Em modo silencioso instala apenas a base; execute `Preparar vozes.cmd` para preparar IA depois. Para testes isolados, `/S /NOINTEGRATION=1 /D=<pasta temporária>` não cria atalhos nem altera o registro de instalação do usuário. A desinstalação preserva a biblioteca e os modelos.

Os downloads de dependências usam HTTPS, revisões fixas e SHA-256. O motor começa no modo client com todos os dispositivos de áudio em -1. Não há captura de microfone na preparação. Falhas de rede mantêm os downloads para nova tentativa. A preparação deve ocorrer com o Voiz fechado pela bandeja.
