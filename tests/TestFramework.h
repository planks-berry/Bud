#pragma once

// A deliberately small test framework. The engine has no third-party dependencies and the
// tests keep it that way, so `cmake && ctest` works on a bare toolchain with no network.

#include <cmath>
#include <functional>
#include <sstream>
#include <string>
#include <type_traits>
#include <vector>

namespace budtest
{

struct TestFailure
{
    std::string message;
};

struct TestCase
{
    std::string suite;
    std::string name;
    std::function<void()> body;
};

std::vector<TestCase>& registry();

struct Registrar
{
    Registrar (const char* suite, const char* name, std::function<void()> body);
};

/// Runs every registered case. Returns the number of failures.
int runAll (const std::string& filter = {});

[[noreturn]] void reportFailure (const char* file, int line, const std::string& message);
void countAssertion();

template <typename T>
std::string describe (const T& value)
{
    std::ostringstream os;

    // Scoped enums have no stream operator, so report the underlying value.
    if constexpr (std::is_enum_v<T>)
        os << static_cast<long long> (value);
    else
        os << value;

    return os.str();
}

inline std::string describe (bool value) { return value ? "true" : "false"; }

} // namespace budtest

//==============================================================================

#define BUD_TEST(suiteName, caseName)                                                        \
    static void budtest_##suiteName##_##caseName();                                          \
    static const ::budtest::Registrar budtest_reg_##suiteName##_##caseName {                 \
        #suiteName, #caseName, budtest_##suiteName##_##caseName };                           \
    static void budtest_##suiteName##_##caseName()

#define CHECK(expr)                                                                          \
    do {                                                                                     \
        ::budtest::countAssertion();                                                         \
        if (! (expr))                                                                        \
            ::budtest::reportFailure (__FILE__, __LINE__, "expected: " #expr);               \
    } while (false)

#define CHECK_EQ(actual, expected)                                                           \
    do {                                                                                     \
        ::budtest::countAssertion();                                                         \
        const auto budActual = (actual);                                                     \
        const auto budExpected = (expected);                                                 \
        if (! (budActual == budExpected))                                                    \
            ::budtest::reportFailure (__FILE__, __LINE__,                                    \
                std::string (#actual) + " == " + #expected                                   \
                    + "\n      actual:   " + ::budtest::describe (budActual)                 \
                    + "\n      expected: " + ::budtest::describe (budExpected));             \
    } while (false)

#define CHECK_NEAR(actual, expected, tolerance)                                              \
    do {                                                                                     \
        ::budtest::countAssertion();                                                         \
        const double budActual = static_cast<double> (actual);                               \
        const double budExpected = static_cast<double> (expected);                           \
        const double budTol = static_cast<double> (tolerance);                               \
        if (! (std::abs (budActual - budExpected) <= budTol))                                \
            ::budtest::reportFailure (__FILE__, __LINE__,                                    \
                std::string (#actual) + " ~= " + #expected                                   \
                    + "\n      actual:   " + ::budtest::describe (budActual)                 \
                    + "\n      expected: " + ::budtest::describe (budExpected)               \
                    + "\n      tolerance: " + ::budtest::describe (budTol));                 \
    } while (false)
