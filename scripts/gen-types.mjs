#!/usr/bin/env node
/**
 * gen-types.mjs — Generates TypeScript interfaces from the protocol schema.
 * Usage: node scripts/gen-types.mjs [--validate]
 *
 * The schema (Mage.Proxy/web/schema/contract.schema.json) describes the
 * wire format of Java view objects as serialized by JsonUtil. Fields are
 * named in camelCase (Java reflection), UUID/enums are strings, dates
 * are epoch millis.
 *
 * --validate: check that the generated output matches types.generated.ts
 *             without overwriting (useful in CI).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SCHEMA_PATH = join(ROOT, 'Mage.Proxy/web/schema/contract.schema.json')
const OUT_PATH = join(ROOT, 'Mage.Proxy/web/src/net/types.generated.ts')

const validate = process.argv.includes('--validate')

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))

const lines = []
function emit(line = '') {
  lines.push(line)
}

function indent(depth) {
  return '  '.repeat(depth)
}

function pascalCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function tsType(def, depth = 0) {
  if (!def) return 'unknown'

  if (def.$ref) {
    const name = def.$ref.replace('#/definitions/', '')
    return name
  }

  // Handle anyOf (e.g. nullable: anyOf: [{$ref: X}, {type: "null"}])
  if (def.anyOf) {
    const types = def.anyOf.map((d) => tsType(d, depth))
    const unique = [...new Set(types)]
    return unique.length === 1 ? unique[0] : unique.join(' | ')
  }

  // Handle JSON Schema union types like ["string", "null"]
  if (Array.isArray(def.type)) {
    const nonNull = def.type.filter((t) => t !== 'null')
    const canBeNull = def.type.includes('null')
    if (nonNull.length === 1) {
      const inner = tsType({ ...def, type: nonNull[0] }, depth)
      return canBeNull ? `${inner} | null` : inner
    }
    return 'unknown'
  }

  if (def.type === 'string') {
    if (def.enum) return def.enum.map((e) => `'${e}'`).join(' | ')
    return 'string'
  }
  if (def.type === 'number' || def.type === 'integer') return 'number'
  if (def.type === 'boolean') return 'boolean'
  if (def.type === 'null') return 'null'

  if (def.type === 'array') {
    const itemType = tsType(def.items, depth)
    return `${itemType}[]`
  }

  if (def.type === 'object') {
    // Record<string, T>
    if (def.additionalProperties && typeof def.additionalProperties === 'object') {
      const valType = tsType(def.additionalProperties, depth)
      return `Record<string, ${valType}>`
    }

    // Inline interface
    if (def.properties) {
      const inner = []
      inner.push('{')
      for (const [propName, propDef] of Object.entries(def.properties)) {
        const optional = !def.required?.includes(propName)
        const type = tsType(propDef, depth + 1)
        inner.push(`${indent(depth + 1)}${optional ? propName + '?' : propName}: ${type}`)
      }
      inner.push(`${indent(depth)}}`)
      return inner.join('\n')
    }

    return 'Record<string, unknown>'
  }

  return 'unknown'
}

function generate() {
  emit('// @generated — Do not edit manually.')
  emit('// Source: schema/contract.schema.json')
  emit('// Run: node scripts/gen-types.mjs')
  emit('')

  const defs = schema.definitions || {}

  for (const [name, def] of Object.entries(defs)) {
    if (def.type === 'object' && def.properties) {
      // Determine if this extends another interface
      const allOf = def.allOf
      const extendsRef = allOf?.length === 1 ? allOf[0]?.$ref : null

      emit(`export interface ${name}${extendsRef ? ` extends ${extendsRef.replace('#/definitions/', '')}` : ''} {`)
      for (const [propName, propDef] of Object.entries(def.properties)) {
        const optional = !def.required?.includes(propName)
        const type = tsType(propDef, 1)
        const optMark = optional ? '?' : ''
        emit(`  ${propName}${optMark}: ${type}`)
      }
      emit('}')
      emit('')
    } else if (def.type === 'object' && def.additionalProperties && typeof def.additionalProperties === 'object') {
      // Record<string, T> type alias (e.g. CardsView = Record<string, CardView>)
      const valType = tsType(def.additionalProperties, 0)
      emit(`export type ${name} = Record<string, ${valType}>`)
      emit('')
    } else if (def.type === 'string' && def.enum) {
      emit(`export type ${name} = ${def.enum.map((e) => `'${e}'`).join(' | ')}`)
      emit('')
    }
  }
}

generate()

const output = lines.join('\n')

if (validate) {
  if (!existsSync(OUT_PATH)) {
    console.error('types.generated.ts does not exist — run gen-types.mjs without --validate first')
    process.exit(1)
  }
  const existing = readFileSync(OUT_PATH, 'utf8')
  if (existing !== output) {
    console.error('types.generated.ts is out of date — run: node scripts/gen-types.mjs')
    process.exit(1)
  }
  console.log('types.generated.ts is up to date')
} else {
  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, output)
  console.log(`Wrote ${OUT_PATH} (${lines.length} lines)`)
}
