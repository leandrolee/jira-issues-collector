import JiraApi from 'jira-client';
import moment from 'moment-business-days';

moment.updateLocale('pt-br', {
   workingWeekdays: [1, 2, 3, 4, 5],
   holidays: ['01/01/2020', '10/04/2020', '21/04/2020', '01/05/2020', '11/06/2020', '07/09/2020', '12/10/2020', '02/11/2020', '25/12/2020', '01/01/2021', '02/04/2021', '21/04/2021', '03/06/2021', '07/09/2021', '12/10/2021', '02/11/2021', '15/11/2021'],
   holidayFormat: 'DD/MM/YYYY'
});

const jira = new JiraApi({
	protocol: 'https',
	host: 'jira.intranet.uol.com.br/jira',
	username: process.env.npm_config_jira_user,
	password: process.env.npm_config_jira_pass,
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

(async () => {
	try {
		const project = process.env.npm_config_project;
		const splitted_statuses = process.env.npm_config_done_statuses.split(',');
		const end_date = process.env.npm_config_end_date;
		const whole_weeks = !!process.env.npm_config_whole_weeks || false;
		const label = process.env.npm_config_label;
		const last_weekday_with_end_date = moment(end_date).endOf('week').subtract(8, 'days');
		const last_weekday_without_end_date = moment().endOf('week').subtract(8, 'days');
		const num_weeks = process.env.npm_config_num_weeks || '12';
		const boardIssues = await jira.searchJira(`project = ${project} AND (issuetype IN (Sub-Block, Sub-Imp, Sub-Bug, "Sub-A&D", "Sub-Daily and Alignments", Sub-DB, Sub-Test) AND issueFunction IN subtasksOf("project = ${project} AND status IN ('${splitted_statuses.join("', '")}')") OR issuetype IN (Incident, Block, "Daily and Alignments", "Suporte Negócios", "Suporte a equipes", Melhoria, Bug, "Service Request")) AND status changed during (${end_date ? (whole_weeks ? [last_weekday_with_end_date.clone().subtract(num_weeks, 'weeks').add(3, 'days').format('YYYY-MM-DD'), last_weekday_with_end_date.format('YYYY-MM-DD')].join(', ') : [moment(end_date).subtract(num_weeks, 'weeks').format('YYYY-MM-DD'), end_date].join(', ')) : (whole_weeks ? [last_weekday_without_end_date.clone().subtract(num_weeks, 'weeks').add(3, 'days').format('YYYY-MM-DD'), last_weekday_without_end_date.format('YYYY-MM-DD')].join(', ') : ['-', num_weeks, 'w, now()'].join(''))}) to ('${splitted_statuses.join("', '")}')${label ? [' AND issueFunction IN subtasksOf(\'labels = ', label, '\')'].join('') : ''} ORDER BY Rank ASC`, {
			startAt: 0,
			maxResults: 1000,
			fields: ['key', 'issuetype', 'summary', 'status', 'created', 'updated', 'timeoriginalestimate', 'timespent', 'labels'],
			expand: ['changelog']
		});
		const byWeek = {};
		const allIssues = {};
		const allSubImpIssues = {};
		let issueTypes = [];

		for (const issue of boardIssues.issues) {
			allIssues[issue.key] = {};
			allIssues[issue.key]['Type'] = issue.fields.issuetype.name;

			if (issue.fields.issuetype.name === 'Sub-Imp') {
				allSubImpIssues[issue.key] = {};
				allSubImpIssues[issue.key]['Estimate'] = moment.duration(issue.fields.timeoriginalestimate, 'seconds').asHours();
				allSubImpIssues[issue.key]['Logged'] = moment.duration(issue.fields.timespent, 'seconds').asHours();	
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
							const issueDoneWeek = moment(change.created).format('w-YYYY');
							if (byWeek[issueDoneWeek] === undefined) {
								byWeek[issueDoneWeek] = {};
							}

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

		console.table(allIssues);
		console.table(allSubImpIssues);
		console.table(sorted);
	} catch(err) {
		console.log(err);
	}
})();
