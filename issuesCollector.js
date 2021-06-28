import JiraApi from 'jira-client';
import moment from 'moment-business-days';
import { JIRA_HOST, JIRA_USER, JIRA_PASS, PROJECT, STORY_STATUSES, DONE_TASK_STATUSES, END_DATE, WHOLE_WEEKS, LABEL, NUM_WEEKS, NUM_TASKS, SHEET_ID } from "babel-dotenv";
const { google } = require('googleapis');
const sheets = google.sheets('v4');
// Arquivo de chaves da conta de serviço do Google
const keys = require('./keys.json');

moment.updateLocale('pt-br', {
   workingWeekdays: [1, 2, 3, 4, 5],
   // TODO: Setar os feriados de forma automatizada
   holidays: ['01/01/2020', '10/04/2020', '21/04/2020', '01/05/2020', '11/06/2020', '07/09/2020', '12/10/2020', '02/11/2020', '25/12/2020', '01/01/2021', '02/04/2021', '21/04/2021', '03/06/2021', '07/09/2021', '12/10/2021', '02/11/2021', '15/11/2021'],
   holidayFormat: 'DD/MM/YYYY'
});

const jira = new JiraApi({
	protocol: 'https',
	host: JIRA_HOST,
	username: JIRA_USER,
	password: JIRA_PASS,
	apiVersion: '2',
	strictSSL: false
});

const ONE_DAY = 24;
const countNonWorkingWeekdaysAndHolidaysInHours = (startDate, endDate) => {
	let nonWorkingWeekdaysAndHolidaysInHours = 0;
	for (let m = moment(startDate); m.isSameOrBefore(endDate, 'day'); m.add(1, 'days')) {
    	if (m.isHoliday() || !m.isBusinessDay()) {
    		nonWorkingWeekdaysAndHolidaysInHours += ONE_DAY;
    	}
	}
	return nonWorkingWeekdaysAndHolidaysInHours;
};

// TODO: Separar em funções específicas
// TODO: Talvez pegar as informações de end_date, label e num_tasks a partir do id da estória recebido como parâmetro, eliminando a necessidade de informar estes 3 parâmetros
(async () => {
	try {
		const project = PROJECT;
		const story_statuses = STORY_STATUSES.split(', ');
		const splitted_statuses = DONE_TASK_STATUSES.split(',');
		const end_date = END_DATE;
		// Flag para considerar semanas inteiras (segunda à sexta)
		const whole_weeks = WHOLE_WEEKS;
		const label = LABEL;
		const last_weekday_with_end_date = moment(end_date).endOf('week').subtract(8, 'days');
		const last_weekday_without_end_date = moment().endOf('week').subtract(8, 'days');
		const num_weeks = NUM_WEEKS;
		const num_tasks = NUM_TASKS || 1;
		const sheet_id = SHEET_ID;
		// JQL executada no Jira
		const boardIssues = await jira.searchJira(`project = ${project} AND (issuetype IN (Sub-Block, Sub-Imp, Sub-Bug, "Sub-A&D", "Sub-Daily and Alignments", Sub-DB, Sub-Test) AND issueFunction IN subtasksOf("project = ${project} AND status IN ('${story_statuses.join("', '")}')${label ? [' AND labels = ', label].join('') : ''}") OR issuetype IN (Incident, Block, "Daily and Alignments", "Suporte Negócios", "Suporte a equipes", Melhoria, Bug, "Service Request")) AND status changed during (${end_date ? (whole_weeks ? [last_weekday_with_end_date.clone().subtract(num_weeks, 'weeks').add(3, 'days').format('YYYY-MM-DD'), last_weekday_with_end_date.format('YYYY-MM-DD')].join(', ') : [moment(end_date).subtract(num_weeks, 'weeks').format('YYYY-MM-DD'), end_date].join(', ')) : (whole_weeks ? [last_weekday_without_end_date.clone().subtract(num_weeks, 'weeks').add(3, 'days').format('YYYY-MM-DD'), last_weekday_without_end_date.format('YYYY-MM-DD')].join(', ') : ['-', num_weeks, 'w, now()'].join(''))}) to ('${splitted_statuses.join("', '")}') ORDER BY Rank ASC`, {
			startAt: 0,
			maxResults: 1000,
			fields: ['key', 'issuetype', 'summary', 'status', 'created', 'updated', 'timeoriginalestimate', 'timespent', 'labels', 'parent'],
			expand: ['changelog']
		});
		const byWeek = {};
		const allIssues = {};
		const allSubImpIssues = {};
		const allSubBugIssues = {};
		let subBugsAvg = 0;
		let issueTypes = [];

		for (const issue of boardIssues.issues) {
			allIssues[issue.key] = {};
			allIssues[issue.key]['Type'] = issue.fields.issuetype.name;

			if (issue.fields.issuetype.name === 'Sub-Imp') {
				allSubImpIssues[issue.key] = {};
				allSubImpIssues[issue.key]['Estimate'] = moment.duration(issue.fields.timeoriginalestimate, 'seconds').asHours();
				allSubImpIssues[issue.key]['Logged'] = moment.duration(issue.fields.timespent, 'seconds').asHours();
			}

			if (issue.fields.issuetype.name === 'Sub-Bug') {
				allSubBugIssues[issue.key] = {};
				allSubBugIssues[issue.key]['Parent'] = issue.fields.parent.key;
			}

			const doneStatusesAccounted = {};
			doneStatusesAccounted[issue.key] = {};
			splitted_statuses.forEach(ss => {
				doneStatusesAccounted[issue.key][ss] = 0;
			});

			for (const change of issue.changelog.histories) {
				for (const i of change.items) {
					if (i.field === 'status' && splitted_statuses.includes(i.toString)) {
						if (doneStatusesAccounted[issue.key].lastUpdated === undefined ||
							 moment(change.created, 'YYYY-MM-DDTHH:mm:ss').isAfter(moment(doneStatusesAccounted[issue.key].lastUpdated, 'YYYY-MM-DDTHH:mm:ss'))) {
							doneStatusesAccounted[issue.key].lastUpdated = change.created;
						}
						doneStatusesAccounted[issue.key][i.toString] +=1;
					}
				}
			}

			const dsaKeys = Object.keys(doneStatusesAccounted);
			const repeatedDoneTasks = {};
			for (const k of dsaKeys) {
				splitted_statuses.forEach(ss => {
					if (doneStatusesAccounted[k][ss] !== undefined && doneStatusesAccounted[k][ss] > 1 && repeatedDoneTasks[k] === undefined) {
						repeatedDoneTasks[k] = doneStatusesAccounted[k];
					}
				});
			}

			let startDate = moment(issue.fields.created, 'YYYY-MM-DDTHH:mm:ss');
			for (const change of issue.changelog.histories) {
				const endDate = moment(change.created, 'YYYY-MM-DDTHH:mm:ss');
				for (const item of change.items) {
					if (item.field === 'status') {
						const nwh = countNonWorkingWeekdaysAndHolidaysInHours(startDate, endDate);

						allIssues[issue.key][item.fromString] = (allIssues[issue.key][item.fromString] || 0) + (moment.duration(endDate.diff(startDate)).subtract(nwh, 'hours').asHours() / 3);

						if (issue.fields.issuetype.name === 'Sub-Imp' && item.fromString === 'In Progress') {
							allSubImpIssues[issue.key][item.fromString] = (allSubImpIssues[issue.key][item.fromString] || 0) + (moment.duration(endDate.diff(startDate)).subtract(nwh, 'hours').asHours() / 3);
						}

						startDate = endDate;
						if (splitted_statuses.includes(item.toString)) {
							const changeCreationDate = moment(change.created);
							const issueDoneWeek = changeCreationDate.format('w-YYYY');
							const startOfWeek = changeCreationDate.startOf('isoWeek').format('DD/MM/YYYY');
							const endOfWeek = changeCreationDate.endOf('isoWeek').format('DD/MM/YYYY');
							if (byWeek[issueDoneWeek] === undefined) {
								byWeek[issueDoneWeek] = {
									'De': startOfWeek,
									'Até': endOfWeek,
								};
							}

							if (Object.keys(repeatedDoneTasks).length === 0 ||
								 moment(change.created).isSame(repeatedDoneTasks[issue.key].lastUpdated)) {
								if (byWeek[issueDoneWeek][issue.fields.issuetype.name] === undefined) {
									byWeek[issueDoneWeek][issue.fields.issuetype.name] = 1;
									issueTypes.push(issue.fields.issuetype.name);
								} else {
									byWeek[issueDoneWeek][issue.fields.issuetype.name] += 1;
								}
							}
						}
					}
				}
			}
		}

		Object.keys(allIssues).forEach((key) => {
			for (const propName in allIssues[key]) {
				if (propName !== 'Type') {
					allIssues[key][propName] = Math.round((allIssues[key][propName] + Number.EPSILON) * 100) / 100;
				}
			}
		});

		Object.keys(allSubImpIssues).forEach((key) => {
			for (const propName in allSubImpIssues[key]) {
				allSubImpIssues[key][propName] = Math.round((allSubImpIssues[key][propName] + Number.EPSILON) * 100) / 100;
			}
		});

		issueTypes = issueTypes.filter((value, index, self) => {
			return self.indexOf(value) === index;
  		});

		Object.keys(byWeek).forEach((key) => {
			let diff = issueTypes.filter(i => !Object.getOwnPropertyNames(byWeek[key]).includes(i));
			diff.forEach((t) => {
				byWeek[key][t] = 0;
			});
		});

		const sorted = {};
		Object.keys(byWeek).sort((s1, s2) => moment(s1, 'YYYY-WW').isBefore(moment(s2, 'YYYY-WW')) ? -1 : 1).forEach((key) => {
    		sorted[key] = byWeek[key];
		});

		// Todas as issues do período
		console.log('=== Todas as issues ===')
		console.table(allIssues);
		// Todas as Sub-Imps do período
		console.log('=== Todas as Sub-Imps ===')
		console.table(allSubImpIssues);
		if (Object.keys(allSubBugIssues).length > 0) {
			// Todos os Sub-Bugs do período com as respectivas estórias
			console.log('=== Todas os Sub-Bugs ===')
			console.table(allSubBugIssues);
			const subBugsQtd = Object.keys(allSubBugIssues).length;
			const subBugsParentsQtd = new Set(Object.values(allSubBugIssues).map(p => p.Parent)).size;
			subBugsAvg = Math.ceil(subBugsQtd/2);
			console.log(`Média arredondada de Sub-Bugs trabalhados por estória no período: ${subBugsAvg}`);
		}
		// Quantidade de issues agrupadas por tipo e pelas semanas do período
		console.log('=== Issues por tipo e semana ===')
		console.table(sorted);

		// Atualização de valores na planilha do Google
		const client = new google.auth.JWT(keys.client_email, null, keys.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
		client.authorize(function(error, tokens) {
			if (error) {
				console.log(error);
				return;
			}
		});

		// Input da data de início e quantidade de tarefas
		const dataRequest = {
			spreadsheetId: sheet_id,
			valueInputOption: 'USER_ENTERED',
			auth: client,
			range: 'Parâmetros!C2:C3',
			resource: {
				values: [[moment(end_date).add(1, 'd').format('DD/MM/YYYY')], [parseInt(num_tasks) + subBugsAvg]]
			},
		};
		await sheets.spreadsheets.values.update(dataRequest);

		// Input do throughput
		const throughput = Object.values(sorted).map(function(obj) {
			return [obj['Sub-Imp']];
		});
		const initThroughputIndex = 6;
		const lastThroughputIndex = initThroughputIndex + Object.keys(sorted).length - 1;
		const lastTableIndex = 36;
		const throughputRequest = {
			spreadsheetId: sheet_id,
			valueInputOption: 'USER_ENTERED',
			auth: client,
			range: `Parâmetros!C${initThroughputIndex}:C${lastThroughputIndex}`,
			resource: {
				values: throughput
			},
		};
		await sheets.spreadsheets.values.update(throughputRequest);

		// Limpeza do throughput residual de execuções anteriores
		const clearRequest = {
			spreadsheetId: sheet_id,
			auth: client,
			range: `Parâmetros!C${lastThroughputIndex + 1}:C${lastTableIndex}`
		};
		await sheets.spreadsheets.values.clear(clearRequest);

		console.log(`Done!\nhttps://docs.google.com/spreadsheets/d/${sheet_id}`);
	} catch(err) {
		console.log(err);
	}
})();
