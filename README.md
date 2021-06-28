# jira-issues-collector

-== Setup ==-
- Após ter a planilha em uma conta do Google, ativar a 'Google Sheets API' de um projeto através do 'Google Cloud Console'
- Criar credenciais (conta de serviço) para a 'Google Sheets API'
- Dar um nome para a conta, ex.: sheets-svc
- Escolher acesso de 'Editor' para a conta de serviço
- Após a criação, entrar na conta de serviço recém criada e no menu 'Chaves', adicionar uma nova chave do tipo json
- Fazer download para a raíz do projeto com o nome 'keys.json', por segurança este arquivo só pode ser baixado logo após sua criação
- De volta para a conta de serviço, copiar o e-mail dela
- Na planilha, clicar em 'Compartilhar' e colar o e-mail da conta de serviço, o acesso deve ser de 'Editor'

obs.: se o arquivo 'keys.json' não estiver na raíz do projeto, ele deve ser copiado do 'Google Drive' da conta do Google


-== Execução ==-
- Preencher os <params...> no arquivo .env que está na raiz do projeto
	- jira_host: domínio onde o Jira Software está rodando
	- jira_user: usuário que tenha acesso ao projeto de onde serão extraídas as métricas
	- jira_pass: senha do usuário
	- story_statuses: os status de uma estória na qual suas tasks serão consideradas como histórico (separados por vírgula, sem espaço, ex.: STORY_STATUSES="Em Desenvolvimento,Desenvolvido,Em Produção")
	- done_task_statuses: os status em que se considera uma task finalizada (separados por vírgula, sem espaço, ex.: DONE_TASK_STATUSES="Desenvolvido,Resolved")
	- project: o código do projeto
	- end_date: o último dia para qual as métricas devem ser extraídas, geralmente um dia antes do início de uma estória que se deseja estimar
	- label: contabilizar apenas estórias com determinada label
	- num_tasks (default: 1): quantidade de tasks debaixo da estória que se deseja estimar
	- sheet_id: id da planilha configurada na conta do Google
	- whole_weeks (default: true): flag utilizada para buscar métricas de semanas fechadas no Jira (segunda à sexta), caso o parâmetro end_date não seja o último dia da semana
	- num_weeks (default: 12): quantidade das últimas semanas buscadas no Jira
- Rodar 'npm start' na raíz do projeto.
