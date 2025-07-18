import { IsArray, IsInt, Min, ArrayMinSize } from 'class-validator';

export class ChooseStudentsDto {
  @IsArray()
  @IsInt({
    each: true,
    message: 'معرف الطالب يجب أن يكون رقمًا صحيحًا أكبر من 0',
  })
  @ArrayMinSize(1, {
    message: 'يجب اختيار طالب واحد على الأقل',
  })
  @Min(1, {
    each: true,
    message: 'معرف الطالب يجب أن يكون رقمًا صحيحًا أكبر من 0',
  })
  studentIds: number[];
}
