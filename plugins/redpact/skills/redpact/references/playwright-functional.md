# Functional browser tests

Default to this path when frontend work changes navigation, forms, state transitions
or user-visible interactions. Cover the changed outcome through actual application
routes and production controls, including persistence/readback when relevant.
Component tests and capture screenshots do not substitute for these assertions.
Observe the acceptance regression fail before implementation and pass afterward.
A restriction on layout inspection alone does not prohibit functional execution;
respect any broader explicit browser restrictions and report missing evidence.

Use with the [Playwright execution guide](playwright.md) for `purpose: "functional"`.
Choose this path for browser interactions whose observable behavior needs assertions:
navigation, form validation, state transitions and user-visible results.

## Author and verify behavior

Exercise actual application routes and production controls with isolated fixture data.
Use accessible locators and meaningful test.step names in the task's language. Assert
the changed outcome, not just that a button exists or a click returned. For example,
a filter test verifies the selected condition and resulting rows; a save test verifies
the success state and relevant persisted/readback result at the supported boundary.
Use the application's actual dependencies; configure changes through the dependency
guide rather than substituting mocks for requested real behavior.

For a claimed regression/TDD cycle, observe the intended assertion fail before the
behavior change and pass afterward. Collection, readiness and environment errors are
setup outcomes. Preserve reviewed assertions and use fresh application inputs.

Use `worktree/tests` for task-only checks and `project/tests` for maintained regression
coverage. Both retain executed code and results in history. Worktree UI Review shows
current drafts and changed maintained files; unchanged project tests remain in project
Tests and full execution history. File-level filtering includes all recorded cases in
the file. Execute the whole chosen target and inspect its complete result, including
cases excluded from the worktree review filter.

Named screenshots are optional diagnostics here; do not create capture checkpoints
for every action. Functional targets run only the current worktree sources. For a
user-visible UI change, author and run a separate capture target using the capture
guide so a human can review the rendered result; do not claim functional screenshots
populate it. A behavior-only change without a rendered UI does not require capture.

## Completion evidence

Inspect terminal scenario and step verdicts, the assertions reached, executed source
identity and cleanup status through the main Playwright guide. Verify the run under
the intended checkout. Report skipped/unreached cases and setup failures explicitly;
a passing browser launch or screenshot is not a passing behavior assertion.
