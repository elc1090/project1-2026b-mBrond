# Challenge of the Day

Aplicação web simples para publicar desafios curtos e registrar respostas de estudantes. O frontend usa HTML, CSS e JavaScript sem frameworks; o backend usa Google Apps Script e Google Sheets.

## Arquivos

- `index.html`, `style.css`, `app.js`, `config.js`: frontend.
- `backend/Code.gs`: API e integração com a planilha.
- `backend/ChallengeEditor.html`: editor de desafios acessível pelo menu da planilha.
- `template/challenge-of-the-day-template.xlsx`: modelo de planilha com dados de exemplo (ver planilha-modelo pública acessível no Google Sheets mais abaixo).
- `template/sample-challenge.json`: exemplo de um desafio.

O arquivo `.xlsx` contém apenas a estrutura e os dados. A planilha-modelo distribuída pelo Google Sheets contém o projeto Apps Script vinculado com os arquivos de `backend/`.

## Instalação

1. Faça uma cópia da **planilha-modelo pública**: https://docs.google.com/spreadsheets/d/1HngfYeFReO--MIo9EO2hOBBWvWgLMtIRwazf4oS0HjA/edit?usp=sharing
2. Na cópia, abra **Extensões → Apps Script** e confirme que o projeto contém `Code.gs` e `ChallengeEditor.html`.
3. No Apps Script, crie uma implantação (deploy) do tipo **Web app** e copie a URL terminada em `/exec`.
4. No frontend, em `config.js`, substitua `GAS_WEB_APP_URL` pela URL da implantação (deploy).
5. Publique os arquivos do frontend no GitHub Pages ou em outro serviço de hospedagem estática.

A planilha possui quatro abas: `Config`, `Students`, `Challenges` e `Responses`. O menu **Challenge of the Day** permite abrir o editor e validar os desafios.

## Desenvolvimento

A requisição principal usada pelo frontend é `getBootstrap`; o envio de respostas usa `submitResponse`. A planilha é a fonte de dados do backend.
