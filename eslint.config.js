import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    rules: {
      'indent': ['warn', 'tab'],
      'no-multi-spaces': 'warn',
      'space-infix-ops': 'warn',
      'comma-spacing': 'warn',
      'key-spacing': 'warn',
      'object-curly-spacing': ['warn', 'always'],
      'array-bracket-spacing': ['warn', 'never'],
      'semi-spacing': 'warn'
    }
  }
]