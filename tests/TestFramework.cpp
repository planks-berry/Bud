#include "TestFramework.h"

#include <cstdio>
#include <iostream>

namespace budtest
{

namespace
{
    int assertionsRun = 0;
}

std::vector<TestCase>& registry()
{
    static std::vector<TestCase> cases;
    return cases;
}

Registrar::Registrar (const char* suite, const char* name, std::function<void()> body)
{
    registry().push_back (TestCase { suite, name, std::move (body) });
}

void countAssertion()
{
    ++assertionsRun;
}

void reportFailure (const char* file, int line, const std::string& message)
{
    std::ostringstream os;
    os << file << ":" << line << "\n      " << message;
    throw TestFailure { os.str() };
}

int runAll (const std::string& filter)
{
    int failures = 0;
    int run = 0;
    std::string currentSuite;

    for (const auto& test : registry())
    {
        const auto fullName = test.suite + "." + test.name;

        if (! filter.empty() && fullName.find (filter) == std::string::npos)
            continue;

        if (test.suite != currentSuite)
        {
            currentSuite = test.suite;
            std::cout << "\n" << currentSuite << "\n";
        }

        ++run;
        const auto assertionsBefore = assertionsRun;

        try
        {
            test.body();
            std::cout << "  ok    " << test.name
                      << "  (" << (assertionsRun - assertionsBefore) << " checks)\n";
        }
        catch (const TestFailure& failure)
        {
            ++failures;
            std::cout << "  FAIL  " << test.name << "\n      " << failure.message << "\n";
        }
        catch (const std::exception& e)
        {
            ++failures;
            std::cout << "  FAIL  " << test.name << "\n      threw: " << e.what() << "\n";
        }
        catch (...)
        {
            ++failures;
            std::cout << "  FAIL  " << test.name << "\n      threw an unknown exception\n";
        }
    }

    // A filter that matches nothing must not report success. Reporting "PASSED — 0 tests" for a
    // mistyped suite name is worse than useless: it looks like a clean run.
    if (run == 0)
    {
        std::cout << "\nNo tests matched";

        if (! filter.empty())
            std::cout << " the filter \"" << filter << "\"";

        std::cout << ". Suites available:";

        std::string listed;

        for (const auto& test : registry())
        {
            if (test.suite != listed)
            {
                listed = test.suite;
                std::cout << " " << listed;
            }
        }

        std::cout << "\n\n";
        return 1;
    }

    std::cout << "\n"
              << (failures == 0 ? "PASSED" : "FAILED") << " — " << run << " tests, "
              << assertionsRun << " checks, " << failures << " failures\n\n";

    return failures;
}

} // namespace budtest

int main (int argc, char** argv)
{
    const std::string filter = argc > 1 ? argv[1] : "";
    return budtest::runAll (filter) == 0 ? 0 : 1;
}
