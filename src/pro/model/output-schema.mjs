/** Frozen VAIWL-PRO/1.0 output schema. Transport validity is not authority. */
export const MODEL_OUTPUT_SCHEMA = {
  "$defs": {
    "Existing": {
      "additionalProperties": false,
      "properties": {
        "conversationHandle": {
          "maxLength": 48,
          "minLength": 1,
          "pattern": "^[a-z][a-z0-9_]*$",
          "title": "Conversationhandle",
          "type": "string"
        },
        "titleSuggestion": {
          "anyOf": [
            {
              "maxLength": 140,
              "minLength": 1,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "title": "Titlesuggestion"
        },
        "evidenceHandles": {
          "items": {
            "maxLength": 48,
            "minLength": 1,
            "pattern": "^[a-z][a-z0-9_]*$",
            "type": "string"
          },
          "maxItems": 12,
          "minItems": 1,
          "title": "Evidencehandles",
          "type": "array"
        },
        "reason": {
          "enum": [
            "same-object-goal",
            "explicit-continuation",
            "compatible-facet",
            "distinct-goal",
            "insufficient-evidence",
            "unknown-membership",
            "constraint-conflict",
            "missing-capability"
          ],
          "title": "Reason",
          "type": "string"
        },
        "explanation": {
          "maxLength": 240,
          "title": "Explanation",
          "type": "string"
        },
        "kind": {
          "const": "EXISTING",
          "title": "Kind",
          "type": "string"
        },
        "topicHandle": {
          "maxLength": 48,
          "minLength": 1,
          "pattern": "^[a-z][a-z0-9_]*$",
          "title": "Topichandle",
          "type": "string"
        }
      },
      "required": [
        "conversationHandle",
        "titleSuggestion",
        "evidenceHandles",
        "reason",
        "explanation",
        "kind",
        "topicHandle"
      ],
      "title": "Existing",
      "type": "object"
    },
    "MultiTopic": {
      "additionalProperties": false,
      "properties": {
        "conversationHandle": {
          "maxLength": 48,
          "minLength": 1,
          "pattern": "^[a-z][a-z0-9_]*$",
          "title": "Conversationhandle",
          "type": "string"
        },
        "titleSuggestion": {
          "anyOf": [
            {
              "maxLength": 140,
              "minLength": 1,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "title": "Titlesuggestion"
        },
        "evidenceHandles": {
          "items": {
            "maxLength": 48,
            "minLength": 1,
            "pattern": "^[a-z][a-z0-9_]*$",
            "type": "string"
          },
          "maxItems": 12,
          "minItems": 1,
          "title": "Evidencehandles",
          "type": "array"
        },
        "reason": {
          "enum": [
            "same-object-goal",
            "explicit-continuation",
            "compatible-facet",
            "distinct-goal",
            "insufficient-evidence",
            "unknown-membership",
            "constraint-conflict",
            "missing-capability"
          ],
          "title": "Reason",
          "type": "string"
        },
        "explanation": {
          "maxLength": 240,
          "title": "Explanation",
          "type": "string"
        },
        "kind": {
          "const": "MULTI_TOPIC",
          "title": "Kind",
          "type": "string"
        },
        "primaryTopicHandle": {
          "maxLength": 48,
          "minLength": 1,
          "pattern": "^[a-z][a-z0-9_]*$",
          "title": "Primarytopichandle",
          "type": "string"
        },
        "relatedTopicHandles": {
          "items": {
            "maxLength": 48,
            "minLength": 1,
            "pattern": "^[a-z][a-z0-9_]*$",
            "type": "string"
          },
          "maxItems": 4,
          "minItems": 1,
          "title": "Relatedtopichandles",
          "type": "array"
        }
      },
      "required": [
        "conversationHandle",
        "titleSuggestion",
        "evidenceHandles",
        "reason",
        "explanation",
        "kind",
        "primaryTopicHandle",
        "relatedTopicHandles"
      ],
      "title": "MultiTopic",
      "type": "object"
    },
    "NewTopic": {
      "additionalProperties": false,
      "properties": {
        "conversationHandle": {
          "maxLength": 48,
          "minLength": 1,
          "pattern": "^[a-z][a-z0-9_]*$",
          "title": "Conversationhandle",
          "type": "string"
        },
        "titleSuggestion": {
          "anyOf": [
            {
              "maxLength": 140,
              "minLength": 1,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "title": "Titlesuggestion"
        },
        "evidenceHandles": {
          "items": {
            "maxLength": 48,
            "minLength": 1,
            "pattern": "^[a-z][a-z0-9_]*$",
            "type": "string"
          },
          "maxItems": 12,
          "minItems": 1,
          "title": "Evidencehandles",
          "type": "array"
        },
        "reason": {
          "enum": [
            "same-object-goal",
            "explicit-continuation",
            "compatible-facet",
            "distinct-goal",
            "insufficient-evidence",
            "unknown-membership",
            "constraint-conflict",
            "missing-capability"
          ],
          "title": "Reason",
          "type": "string"
        },
        "explanation": {
          "maxLength": 240,
          "title": "Explanation",
          "type": "string"
        },
        "kind": {
          "const": "NEW_TOPIC",
          "title": "Kind",
          "type": "string"
        },
        "seed": {
          "$ref": "#/$defs/TopicSeed"
        }
      },
      "required": [
        "conversationHandle",
        "titleSuggestion",
        "evidenceHandles",
        "reason",
        "explanation",
        "kind",
        "seed"
      ],
      "title": "NewTopic",
      "type": "object"
    },
    "TopicSeed": {
      "additionalProperties": false,
      "properties": {
        "name": {
          "maxLength": 140,
          "minLength": 1,
          "title": "Name",
          "type": "string"
        },
        "object": {
          "maxLength": 140,
          "minLength": 1,
          "title": "Object",
          "type": "string"
        },
        "goal": {
          "maxLength": 140,
          "minLength": 1,
          "title": "Goal",
          "type": "string"
        },
        "outcome": {
          "anyOf": [
            {
              "maxLength": 140,
              "minLength": 1,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "title": "Outcome"
        },
        "qualifiers": {
          "items": {
            "maxLength": 140,
            "minLength": 1,
            "type": "string"
          },
          "maxItems": 4,
          "title": "Qualifiers",
          "type": "array"
        }
      },
      "required": [
        "name",
        "object",
        "goal",
        "outcome",
        "qualifiers"
      ],
      "title": "TopicSeed",
      "type": "object"
    },
    "Unknown": {
      "additionalProperties": false,
      "properties": {
        "conversationHandle": {
          "maxLength": 48,
          "minLength": 1,
          "pattern": "^[a-z][a-z0-9_]*$",
          "title": "Conversationhandle",
          "type": "string"
        },
        "titleSuggestion": {
          "title": "Titlesuggestion",
          "type": "null"
        },
        "evidenceHandles": {
          "items": {
            "maxLength": 48,
            "minLength": 1,
            "pattern": "^[a-z][a-z0-9_]*$",
            "type": "string"
          },
          "maxItems": 12,
          "title": "Evidencehandles",
          "type": "array"
        },
        "reason": {
          "enum": [
            "insufficient-evidence",
            "unknown-membership",
            "constraint-conflict",
            "missing-capability"
          ],
          "title": "Reason",
          "type": "string"
        },
        "explanation": {
          "maxLength": 240,
          "title": "Explanation",
          "type": "string"
        },
        "kind": {
          "const": "UNKNOWN",
          "title": "Kind",
          "type": "string"
        }
      },
      "required": [
        "conversationHandle",
        "titleSuggestion",
        "evidenceHandles",
        "reason",
        "explanation",
        "kind"
      ],
      "title": "Unknown",
      "type": "object"
    }
  },
  "additionalProperties": false,
  "properties": {
    "schemaVersion": {
      "const": "vaiwl-pro-model-output/1",
      "title": "Schemaversion",
      "type": "string"
    },
    "requestNonce": {
      "maxLength": 96,
      "minLength": 8,
      "title": "Requestnonce",
      "type": "string"
    },
    "items": {
      "items": {
        "anyOf": [
          {
            "$ref": "#/$defs/Existing"
          },
          {
            "$ref": "#/$defs/NewTopic"
          },
          {
            "$ref": "#/$defs/MultiTopic"
          },
          {
            "$ref": "#/$defs/Unknown"
          }
        ]
      },
      "maxItems": 10,
      "minItems": 1,
      "title": "Items",
      "type": "array"
    }
  },
  "required": [
    "schemaVersion",
    "requestNonce",
    "items"
  ],
  "title": "ModelOutput",
  "type": "object",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:vaiwl:pro:model-output:1",
  "description": "Provider output only. Schema validity never confers identity, source permission, authority, quality acceptance, or native write capability."
};
