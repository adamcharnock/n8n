<template>
	<div ref="sqlEditor" class="ph-no-capture"></div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { MSSQL, MySQL, PostgreSQL, sql, StandardSQL } from '@codemirror/lang-sql';
import type { SQLDialect } from 'n8n-workflow';
import useEditor from './useEditor';

export type SqlEditorProps = {
	value: string;
	isReadOnly?: boolean;
	rows?: number;
	dialect: SQLDialect;
};

const SQL_DIALECTS = {
	standard: StandardSQL,
	mssql: MSSQL,
	mysql: MySQL,
	postgres: PostgreSQL,
} as const;

const sqlEditor = ref<HTMLDivElement>();
const {
	value,
	isReadOnly,
	rows,
	dialect: dialectName,
} = withDefaults(defineProps<SqlEditorProps>(), { isReadOnly: false, rows: -1 });
const dialect = SQL_DIALECTS[dialectName] ?? SQL_DIALECTS.standard;

const emit = defineEmits<{
	(event: 'valueChanged', value: string | undefined): void;
}>();

useEditor({
	container: sqlEditor,
	emit,
	value,
	rows,
	isReadOnly,
	extensions: {
		base: [sql({ dialect, upperCaseKeywords: true })],
	},
});
</script>
