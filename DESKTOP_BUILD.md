# Chroma Tool Studio - Instalador .exe (VISION4RIO)

Este projeto ja esta preparado para empacotar o app como instalador Windows.

## Requisitos

- Windows 10/11 64-bit
- Node.js 20+
- npm 10+

## Gerar instalador (.exe)

No terminal, dentro da pasta do projeto:

```bash
npm install
node scripts/build-windows-installer.mjs
```

O script ja corrige automaticamente o erro de `electron`/`electron-builder` em `dependencies`.
Tambem esta configurado para gerar instalador sem etapa de assinatura/edicao do executavel (evita erro de permissao com symlink no `winCodeSign`).

Ao final, o instalador sera gerado em:

`release/Chroma-Tool-Studio-Setup-<versao>.exe`

Se o instalador nao aparecer, confira no terminal se o passo `[2/2]` executou e se a pasta `release/` foi criada.
Se voce tinha tentativas anteriores com erro de `winCodeSign`, apague o cache e rode de novo:

```bash
rmdir /s /q %LOCALAPPDATA%\electron-builder\Cache
node scripts/build-windows-installer.mjs
```

## Comportamento do instalador

- Instalacao estilo programa comum (wizard NSIS)
- Instalacao por maquina (`C:\Program Files`) com elevacao UAC
- Opcao de trocar pasta de instalacao no instalador
- Atalho na Area de Trabalho criado automaticamente
- Atalho no Menu Iniciar criado automaticamente
- App roda offline localmente (carrega somente arquivos locais empacotados)
- O usuario pode salvar os arquivos processados em qualquer pasta permitida pelo Windows

## Modo desenvolvimento desktop

1. Rode a interface web:

```bash
npm run dev
```

2. Em outro terminal, execute o shell Electron:

```bash
npx electron electron/main.cjs
```

## Otimizacao aplicada

- Bundle web produzido por Vite em modo producao
- Empacotamento ASAR para reduzir IO
- Compressao `maximum` no instalador NSIS
- Menu nativo oculto e sandbox ativa no runtime

## Creditos

Produto e creditos visiveis no app:

- **VISION4RIO**
