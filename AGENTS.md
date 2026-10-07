# Testable handoffs

Whenever you make a change, ensure there is something concrete and accessible for the user to test before finishing the task.

- For web application changes, start or update a working local preview and provide the exact URL and relevant route or interaction to test. Keep the preview available after the handoff whenever the environment supports it.
- For generated artifacts or non-web changes, provide the built artifact, executable command, fixture, or other direct test surface needed to exercise the result.
- Run appropriate automated checks in addition to providing the manual test surface; automated checks alone do not satisfy this rule.
- In the final response, state what is available to test and give concise testing instructions.
- If a testable result cannot be made available, do not imply the work is complete. Explain the concrete blocker and what is needed to make it testable.
