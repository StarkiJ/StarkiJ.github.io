; LLVM 22.1.0 examples used by the LLVM note.
; choose: cond selects x + 1 or x - 1.
; sum_to: for nonnegative n with a signed-i32 result, returns 0 + ... + (n - 1).

define i32 @choose(i1 %cond, i32 %x) {
entry:
  br i1 %cond, label %yes, label %no
yes:
  %a = add i32 %x, 1
  br label %merge
no:
  %b = sub i32 %x, 1
  br label %merge
merge:
  %result = phi i32 [ %a, %yes ], [ %b, %no ]
  ret i32 %result
}

define i32 @sum_to(i32 %n) {
entry:
  br label %loop
loop:
  %i = phi i32 [ 0, %entry ], [ %next, %body ]
  %sum = phi i32 [ 0, %entry ], [ %updated, %body ]
  %more = icmp slt i32 %i, %n
  br i1 %more, label %body, label %exit
body:
  %updated = add i32 %sum, %i
  %next = add i32 %i, 1
  br label %loop
exit:
  ret i32 %sum
}
