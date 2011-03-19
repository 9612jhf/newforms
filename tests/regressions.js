module = QUnit.module;

module("regressions");

test("deepCopy", function()
{
    expect(1);

    // Copied RegExps were throwing a "called on incompatible Object" exception
    var TestForm = forms.Form({
      regex: forms.RegexField(/test/),
      email: forms.EmailField(),
      url: forms.URLField()
    });
    var f = TestForm({data: {
      regex: "test",
      email: "test@test.com",
      url: "https://github.com"
    }});
    strictEqual(f.isValid(), true,
                "Copied RegExp fields don't throw exceptions when validating");
});
