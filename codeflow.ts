
class Test  {
    /**
     * @codeflow id cf-0
     * @codeflow name My Codeflow on a method
     */    
    static method() {

    }
}

/**
 * @codeflow id cf-1
 * @codeflow name My Codeflow on a function
 */
async function process(a: string) {
    let x = 3;
    let y: string | number;
    let z: boolean;
    let $fail = 0;
    let $last = 0;
    let $next = 0;
    let $iter = 1000;
    let $step = 0;
    let $test: any;
    let $result: any = 0;
    let $throw: any = 0;
    while ($step && $iter-- > 0) {
        $fail = $last;
        $next = $last;

        try {
            switch ($step) {
                case 1:
                    // Some description of this step.
                    // @name Some Name
                    // @px grid data
                    alert();
                    $test = prompt();
                    // @px edge data
                    $test && ($next = 4);
                    $test || ($next = 3);
                    break;

                case 2:
                    alert();
                    myfuncs.someFeature({
                        input1: 0,
                        input2: "",
                    });
                    break;
            }
        }
        catch (e) {
            $step = $fail;
            $throw = e;
        }
    }

    if ($iter < 0) {
        throw new TypeError("Execution limit exceeded.");
    }

    if ($throw && typeof $throw === "object") {
        throw $throw;
    }

    return $result;
}

export { process, Test };