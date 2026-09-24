# Publicação

## 1. Testar no GitHub Pages
O frontend funciona sozinho em modo DEMO com localStorage.

1. Repositório > Settings > Pages.
2. Em Build and deployment, selecione **GitHub Actions**.
3. O workflow `.github/workflows/pages.yml` publica automaticamente.
4. Abra a URL do GitHub Pages no celular.
5. Login DEMO: `gerente` / `123456`.

## 2. Ativar Google Sheets + Drive
1. Abra https://script.google.com e crie um projeto.
2. Copie `backend/Code.gs` e `backend/appsscript.json`.
3. Em **Configurações do projeto > Propriedades do script**, crie: `SPREADSHEET_ID`, `ROOT_FOLDER_ID`, `VEHICLES_FOLDER_ID` e opcionalmente `TZ`.
4. Execute uma vez no editor: `setupManager('gerente','SUA-SENHA-FORTE','Gerente')`.
5. Implantar > Nova implantação > Aplicativo da Web.
6. Executar como: você. Acesso: conforme política institucional.
7. Copie a URL `/exec`.
8. Em `config.js`, troque:
   - `mode: 'live'`
   - `apiUrl: 'URL_DO_APPS_SCRIPT'`
9. Faça commit e aguarde o GitHub Pages atualizar.

## Segurança
- Não use dados operacionais reais da FAB no repositório público.
- O repositório contém somente código; senhas reais não devem ser commitadas.
- No backend, senhas são armazenadas como `salt + SHA-256`, nunca em texto puro.
- Para uso institucional, valide autorização, classificação da informação, política de contas e armazenamento.
