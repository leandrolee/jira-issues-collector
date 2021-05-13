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
- Rodar 'npm <params...> start' na raíz do projeto, onde os <params...> obrigatórios são:
	- jira_host: domínio onde o Jira Software está rodando
	- jira_user: usuário que tenha acesso ao projeto de onde serão extraídas as métricas
	- jira_pass: senha do usuário
	- done_story_statuses: os status em que se considera uma estória finalizada
	- done_task_statuses: os status em que se considera uma task finalizada
	- project: o código do projeto
	- end_date: o último dia para qual as métricas devem ser extraídas, geralmente um dia antes do início de uma estória que se deseja estimar
	- label: contabilizar apenas estórias com determinada label
	- num_tasks: quantidade de tasks debaixo da estória que se deseja estimar
	- sheet_id: id da planilha configurada na conta do Google

ex.: npm --jira_host=jira.intranet.dominio.com.br/jira --jira_user=juser --jira_pass=mypass --done_story_statuses=Desenvolvido,"Em Produção" --done_task_statuses=Desenvolvido,Resolved --project=ABCDE --end_date=2021-01-15 --label=saturno --num_tasks=10 --sheet_id=1A2b3C-4d5E6f start